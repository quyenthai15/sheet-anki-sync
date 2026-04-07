const fs = require('fs');
const path = require("path");
const axios = require('axios');
const http = require('http');
const { parse } = require("csv-parse/sync");

const ANKI_URL = "http://127.0.0.1:8765";
const CONFIG_PATH = path.join(__dirname, 'config.json');

// Use a dedicated agent to prevent socket hang-ups/reuse issues
const agent = new http.Agent({ keepAlive: false });

/**
 * Loads the configuration and handles CLI flags.
 */
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('config.json not found!');
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH));
  
  // CLI Flags
  config.force_sync = process.argv.includes('--force') || process.argv.includes('--forceUpdate');
  config.dry_run = process.argv.includes('--dry-run');
  
  if (config.force_sync) console.log('--- Force Sync Enabled ---');
  if (config.dry_run) console.log('--- DRY RUN MODE (No changes will be saved) ---');
  
  return config;
}

/**
 * AnkiConnect Helper
 */
async function ankiAction(action, params = {}) {
  try {
    const res = await axios.post(
      ANKI_URL,
      { action, version: 6, params },
      { timeout: 60000, httpAgent: agent },
    );
    if (res.data.error) throw new Error(res.data.error);
    return res.data.result;
  } catch (e) {
    if (e.code === "ECONNREFUSED") throw new Error("Anki is not running or AnkiConnect is not installed.");
    throw e;
  }
}

/**
 * Validates the setup on both Anki and Google Sheets (CSV) sides.
 */
async function validateSetup(config, csvHeaders) {
  console.log('Validating setup...');
  
  // 1. Validate Sheet Columns
  const missingCols = [];
  for (const sheetCol of Object.keys(config.mapping)) {
    if (!csvHeaders.includes(sheetCol)) missingCols.push(sheetCol);
  }
  if (missingCols.length > 0) {
    throw new Error(`Sheet column(s) not found in CSV: ${missingCols.join(', ')}. Please check your mapping in config.json.`);
  }

  // 2. Validate Anki Deck
  const decks = await ankiAction('deckNames');
  if (!decks.includes(config.anki_deck)) {
    throw new Error(`Anki deck "${config.anki_deck}" not found.`);
  }

  // 3. Validate Anki Model (Note Type)
  const models = await ankiAction('modelNames');
  if (!models.includes(config.anki_model)) {
    throw new Error(`Anki Note Type "${config.anki_model}" not found.`);
  }

  // 4. Validate Anki Fields
  const modelFields = await ankiAction('modelFieldNames', { modelName: config.anki_model });
  const mappedAnkiFields = Object.values(config.mapping);
  if (config.audio_field) mappedAnkiFields.push(config.audio_field);

  const missingFields = mappedAnkiFields.filter(f => !modelFields.includes(f));
  if (missingFields.length > 0) {
    throw new Error(`Anki field(s) not found in Note Type "${config.anki_model}": ${missingFields.join(', ')}.`);
  }

  console.log('Validation successful.');
}

/**
 * Get all existing notes and their field values.
 * Returns a Map of word -> { noteId, fields }.
 */
async function getAnkiDataMap(deck, model, primaryAnkiField) {
  console.log(`Fetching current cards from Anki...`);
  const noteIds = await ankiAction("findNotes", { query: `deck:"${deck}"` });
  const notesMap = new Map();
  const chunkSize = 500;
  
  for (let i = 0; i < noteIds.length; i += chunkSize) {
    const chunk = noteIds.slice(i, i + chunkSize);
    const notesInfo = await ankiAction("notesInfo", { notes: chunk });
    notesInfo.forEach((info) => {
      if (info.modelName === model && info.fields[primaryAnkiField]) {
        const primaryValue = info.fields[primaryAnkiField].value.trim();
        const fields = {};
        Object.keys(info.fields).forEach(f => fields[f] = info.fields[f].value.trim());
        notesMap.set(primaryValue, { noteId: info.noteId, fields });
      }
    });
  }
  return notesMap;
}

function getTtsUrl(text, lang = 'ja') {
  return `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(text)}`;
}

/**
 * Main Sync Function
 */
async function sync() {
  const config = loadConfig();

  // 1. Fetch CSV
  console.log("Fetching CSV data from Google Sheets...");
  const res = await axios.get(config.sheet_csv_url);
  const records = parse(res.data, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (records.length === 0) {
    console.log("No data found in CSV.");
    return;
  }

  // 2. Validate Everything
  await validateSetup(config, Object.keys(records[0]));

  // 3. Get existing notes map for smart diffing
  const firstSheetCol = Object.keys(config.mapping)[0];
  const firstAnkiField = config.mapping[firstSheetCol];
  const ankiDataMap = await getAnkiDataMap(config.anki_deck, config.anki_model, firstAnkiField);

  // 4. Prepare updates and additions
  const notesToAdd = [];
  const notesToUpdate = [];

  for (const row of records) {
    const word = (row[firstSheetCol] || "").trim();
    if (!word) continue;

    // Map CSV row to Anki fields based on config
    const fields = {};
    for (const [sheetCol, ankiField] of Object.entries(config.mapping)) {
      fields[ankiField] = (row[sheetCol] || "").trim();
    }

    // Audio Logic: Only generate if field is empty or it's a new card
    const existingNote = ankiDataMap.get(word);
    const hasExistingAudio = existingNote && existingNote.fields[config.audio_field] && existingNote.fields[config.audio_field].includes('[sound:');
    
    const audio = [];
    if (config.audio_field && (!existingNote || !hasExistingAudio)) {
      // Use a cleaner filename that supports Japanese characters (Anki handles UTF-8 filenames well)
      const safeFilename = `ja_tts_${word.replace(/[\/\\?%*:|"<>]/g, '_')}.mp3`;
      audio.push({
        url: getTtsUrl(word),
        filename: safeFilename,
        fields: [config.audio_field]
      });
    }

    if (existingNote) {
      if (config.force_sync) {
        // SMART DIFF: Check if any mapped field has changed
        let hasChanged = false;
        for (const [ankiField, newValue] of Object.entries(fields)) {
          if (existingNote.fields[ankiField] !== newValue) {
            hasChanged = true;
            break;
          }
        }

        // Also check if we need to add missing audio
        const needsAudio = config.audio_field && !hasExistingAudio;

        if (hasChanged || needsAudio) {
          notesToUpdate.push({
            id: existingNote.noteId,
            fields: fields,
            audio: audio.length > 0 ? audio : undefined
          });
        }
      }
      continue;
    }

    notesToAdd.push({
      deckName: config.anki_deck,
      modelName: config.anki_model,
      fields: fields,
      audio: audio.length > 0 ? audio : undefined,
      options: { allowDuplicate: false },
      tags: ["csv-sync"],
    });
  }

  // 5. Execution Summary
  if (config.dry_run) {
    console.log(`\nDRY RUN SUMMARY:`);
    console.log(`- New cards to add: ${notesToAdd.length}`);
    console.log(`- Cards with changes to update: ${notesToUpdate.length}`);
    console.log('No changes were made to Anki.');
    return;
  }

  // 6. Execute Updates
  if (notesToUpdate.length > 0) {
    console.log(`Updating ${notesToUpdate.length} cards...`);
    const actions = notesToUpdate.map(note => ({
      action: "updateNoteFields",
      params: { note }
    }));
    
    for (let i = 0; i < actions.length; i += 100) {
      await ankiAction("multi", { actions: actions.slice(i, i + 100) });
    }
    console.log(`Update complete.`);
  }

  // 7. Execute Additions
  if (notesToAdd.length > 0) {
    console.log(`Adding ${notesToAdd.length} new notes...`);
    const results = await ankiAction("addNotes", { notes: notesToAdd });
    const successCount = results.filter((id) => id !== null).length;
    console.log(`Added ${successCount} notes.`);
  }

  if (notesToAdd.length === 0 && notesToUpdate.length === 0) {
    console.log('No changes detected. Everything is already in sync!');
  } else {
    console.log('Sync complete!');
  }
}

sync().catch((err) => {
  console.error("Sync failed:", err.message);
});
