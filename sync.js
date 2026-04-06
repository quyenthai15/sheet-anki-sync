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
 * Loads the configuration.
 */
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('config.json not found!');
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH));
  
  // Check for CLI flags
  if (process.argv.includes('--force') || process.argv.includes('--forceUpdate')) {
    config.force_sync = true;
    console.log('--- Force Sync Enabled via CLI ---');
  }
  
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
      { 
        timeout: 60000,
        httpAgent: agent 
      },
    );
    if (res.data.error) throw new Error(res.data.error);
    return res.data.result;
  } catch (e) {
    if (e.code === "ECONNREFUSED") {
      throw new Error("Anki is not running or AnkiConnect is not installed.");
    }
    if (e.code === "ECONNRESET" || e.message.includes("hang up")) {
      throw new Error(
        'Anki connection dropped. This usually happens if Anki is "locked" by another window (Add, Browse, Preferences). Please close them and try again.',
      );
    }
    throw e;
  }
}

/**
 * Get all existing notes and their IDs.
 * Returns a Map of word -> noteId.
 */
async function getExistingNotesMap(deck, model, fieldName) {
  console.log(`Checking Anki deck "${deck}" for existing cards...`);
  const noteIds = await ankiAction("findNotes", { query: `deck:"${deck}"` });
  if (noteIds.length === 0) return new Map();

  const notesMap = new Map();
  const chunkSize = 500;
  
  for (let i = 0; i < noteIds.length; i += chunkSize) {
    const chunk = noteIds.slice(i, i + chunkSize);
    const notesInfo = await ankiAction("notesInfo", { notes: chunk });
    notesInfo.forEach((info) => {
      if (info.modelName === model && info.fields[fieldName]) {
        notesMap.set(info.fields[fieldName].value.trim(), info.noteId);
      }
    });
  }
  
  return notesMap;
}

/**
 * Generates a Google Translate TTS URL for Japanese.
 */
function getTtsUrl(text) {
  return `https://translate.google.com/translate_tts?ie=UTF-8&tl=ja&client=tw-ob&q=${encodeURIComponent(text)}`;
}

/**
 * Main Sync Function
 */
async function sync() {
  const config = loadConfig();
  if (
    !config.sheet_csv_url ||
    config.sheet_csv_url.includes("YOUR_PUBLISHED_CSV_URL_HERE")
  ) {
    console.error("Error: Please provide a valid sheet_csv_url in config.json.");
    return;
  }

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

  // 2. Identify Primary Key (First field in mapping)
  const firstSheetCol = Object.keys(config.mapping)[0];
  const firstAnkiField = config.mapping[firstSheetCol];

  // 3. Get existing notes map
  const existingNotesMap = await getExistingNotesMap(
    config.anki_deck,
    config.anki_model,
    firstAnkiField,
  );

  // 4. Prepare updates and additions
  const notesToAdd = [];
  const notesToUpdate = [];

  for (const row of records) {
    const word = (row[firstSheetCol] || "").trim();
    if (!word) continue;

    const fields = {};
    for (const [sheetCol, ankiField] of Object.entries(config.mapping)) {
      fields[ankiField] = row[sheetCol] || "";
    }

    // Audio Logic
    const audio = [];
    if (config.audio_field) {
      audio.push({
        url: getTtsUrl(word),
        filename: `ja_tts_${word.replace(/[^\w\s]/gi, '_')}.mp3`,
        fields: [config.audio_field]
      });
    }

    if (existingNotesMap.has(word)) {
      if (config.force_sync) {
        notesToUpdate.push({
          id: existingNotesMap.get(word),
          fields: fields,
          audio: audio.length > 0 ? audio : undefined
        });
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

  // 5. Bulk Update Existing Notes
  if (notesToUpdate.length > 0) {
    console.log(`Updating ${notesToUpdate.length} existing notes...`);
    const actions = notesToUpdate.map(note => ({
      action: "updateNoteFields",
      params: { note }
    }));
    
    // Chunk multi actions
    const multiChunkSize = 100;
    for (let i = 0; i < actions.length; i += multiChunkSize) {
      await ankiAction("multi", { actions: actions.slice(i, i + multiChunkSize) });
    }
    console.log(`Update complete.`);
  }

  // 6. Bulk Add New Notes
  if (notesToAdd.length > 0) {
    console.log(`Adding ${notesToAdd.length} new notes...`);
    const results = await ankiAction("addNotes", { notes: notesToAdd });
    const successCount = results.filter((id) => id !== null).length;
    console.log(`Added ${successCount} notes.`);
  }

  if (notesToAdd.length === 0 && notesToUpdate.length === 0) {
    console.log('No changes detected. Everything is already in Anki!');
  } else {
    console.log('Sync complete!');
  }
}

sync().catch((err) => {
  console.error("Sync failed:", err.message);
});
