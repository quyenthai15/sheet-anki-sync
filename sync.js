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

    // AnkiConnect specific error handling
    if (res.data.error) {
      return { success: false, error: res.data.error, data: null };
    }
    return { success: true, data: res.data.result, error: null };
  } catch (e) {
    if (e.code === "ECONNREFUSED") {
      return {
        success: false,
        error: "Anki is not running or AnkiConnect is not installed.",
        data: null,
      };
    }
    // For other unexpected network errors, re-throw or return generic error
    return {
      success: false,
      error: e.message || "An unknown network error occurred.",
      data: null,
    };
  }
}

/**
 * Validates the setup on both Anki and Google Sheets (CSV) sides.
 */
async function validateSetup(config, csvHeaders) {
  console.log("Validating setup...");

  // 1. Validate Sheet Columns
  const missingCols = [];
  for (const sheetCol of Object.keys(config.mapping)) {
    if (!csvHeaders.includes(sheetCol)) missingCols.push(sheetCol);
  }
  if (missingCols.length > 0) {
    throw new Error(
      `Sheet column(s) not found in CSV: ${missingCols.join(", ")}. Please check your mapping in config.json.`,
    );
  }

  // 2. Validate/Create Anki Deck
  const deckNamesResult = await ankiAction("deckNames");
  if (!deckNamesResult.success) {
    throw new Error(`Failed to get deck names: ${deckNamesResult.error}`);
  }
  const decks = deckNamesResult.data;

  if (!decks.includes(config.anki_deck)) {
    console.log(
      `Anki deck "${config.anki_deck}" not found. Attempting to create it...`,
    );
    const createDeckResult = await ankiAction("createDeck", {
      deck: config.anki_deck,
    });
    if (!createDeckResult.success) {
      throw new Error(
        `Failed to create Anki deck "${config.anki_deck}": ${createDeckResult.error}`,
      );
    }
    console.log(`Anki deck "${config.anki_deck}" created.`);
  }

  // 3. Validate Anki Model (Note Type)
  const modelNamesResult = await ankiAction("modelNames");
  if (!modelNamesResult.success) {
    throw new Error(`Failed to get model names: ${modelNamesResult.error}`);
  }
  const models = modelNamesResult.data;

  if (!models.includes(config.anki_model)) {
    throw new Error(
      `Anki Note Type "${config.anki_model}" not found.\n` +
        `Please import the appropriate .apkg file from the 'templates/' folder, ` +
        `or create this Note Type manually in Anki.`,
    );
  }

  // 4. Validate Anki Fields
  const modelFieldNamesResult = await ankiAction("modelFieldNames", {
    modelName: config.anki_model,
  });
  if (!modelFieldNamesResult.success) {
    throw new Error(
      `Failed to get model field names for "${config.anki_model}": ${modelFieldNamesResult.error}`,
    );
  }
  const modelFields = modelFieldNamesResult.data;

  const mappedAnkiFields = Object.values(config.mapping);
  if (config.audio_field) mappedAnkiFields.push(config.audio_field);
  if (config.sentence_audio_field)
    mappedAnkiFields.push(config.sentence_audio_field); // New field validation

  const missingFields = mappedAnkiFields.filter(
    (f) => !modelFields.includes(f),
  );
  if (missingFields.length > 0) {
    throw new Error(
      `Anki field(s) not found in Note Type "${config.anki_model}": ${missingFields.join(", ")}.`,
    );
  }

  console.log("Validation successful.");
}

/**
 * Get all existing notes and their field values.
 * Returns a Map of word -> { noteId, fields }.
 */
async function getAnkiDataMap(deck, model, primaryAnkiField) {
  console.log(`Fetching current cards from Anki...`);
  const findNotesResult = await ankiAction("findNotes", {
    query: `deck:"${deck}"`,
  });
  if (!findNotesResult.success) {
    throw new Error(
      `Failed to find notes in deck "${deck}": ${findNotesResult.error}`,
    );
  }
  const noteIds = findNotesResult.data;

  const notesMap = new Map();
  const chunkSize = 500; // AnkiConnect recommends chunking large requests

  for (let i = 0; i < noteIds.length; i += chunkSize) {
    const chunk = noteIds.slice(i, i + chunkSize);
    const notesInfoResult = await ankiAction("notesInfo", { notes: chunk });
    if (!notesInfoResult.success) {
      throw new Error(`Failed to get info for notes: ${notesInfoResult.error}`);
    }
    const notesInfo = notesInfoResult.data;

    notesInfo.forEach((info) => {
      if (info.modelName === model && info.fields[primaryAnkiField]) {
        const primaryValue = info.fields[primaryAnkiField].value.trim();
        const fields = {};
        Object.keys(info.fields).forEach(
          (f) => (fields[f] = info.fields[f].value.trim()),
        );
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
    const hasExistingSentenceAudio =
      existingNote &&
      config.sentence_audio_field &&
      existingNote.fields[config.sentence_audio_field] &&
      existingNote.fields[config.sentence_audio_field].includes("[sound:");

    const audio = [];
    // Primary word audio
    if (
      config.audio_field &&
      (!existingNote || !hasExistingAudio) &&
      fields[firstAnkiField]
    ) {
      const safeFilename = `ja_tts_${fields[firstAnkiField].replace(/[\/\\?%*:|"<>]/g, "_")}.mp3`;
      audio.push({
        url: getTtsUrl(fields[firstAnkiField]),
        filename: safeFilename,
        fields: [config.audio_field],
      });
    }

    // Sentence audio
    const japaneseSentence = fields[config.mapping["JP sentence"]];
    if (
      config.sentence_audio_field &&
      japaneseSentence &&
      (!existingNote || !hasExistingSentenceAudio)
    ) {
      const safeFilename = `ja_sentence_tts_${japaneseSentence.substring(0, 50).replace(/[\/\\?%*:|"<>]/g, "_")}.mp3`;
      audio.push({
        url: getTtsUrl(japaneseSentence),
        filename: safeFilename,
        fields: [config.sentence_audio_field],
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
        const needsSentenceAudio =
          config.sentence_audio_field &&
          !hasExistingSentenceAudio &&
          japaneseSentence;

        if (hasChanged || needsAudio || needsSentenceAudio) {
          notesToUpdate.push({
            id: existingNote.noteId,
            fields: fields,
            audio: audio.length > 0 ? audio : undefined,
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

    if (notesToAdd.length > 0) {
      console.log("\nValidating additions...");
      const canAddResult = await ankiAction("canAddNotesWithErrorDetail", {
        notes: notesToAdd,
      });
      if (canAddResult.success) {
        canAddResult.data.forEach((res, index) => {
          if (!res.canAdd) {
            const identifyingField = Object.values(notesToAdd[index].fields)[0];
            console.warn(`[!] Cannot add "${identifyingField}": ${res.error}`);
          }
        });
      }
    }

    console.log("\nNo changes were made to Anki.");
    return;
  }

  // 6. Execute Updates
  if (notesToUpdate.length > 0) {
    console.log(`Updating ${notesToUpdate.length} cards...`);
    // updateNotes is more efficient for bulk updates
    const updateNotesResult = await ankiAction("updateNotes", {
      notes: notesToUpdate,
    });

    if (!updateNotesResult.success) {
      console.error(
        `Failed to execute bulk updates: ${updateNotesResult.error}`,
      );
    } else {
      console.log(`Update complete.`);
    }
  }

  // 7. Execute Additions
  if (notesToAdd.length > 0) {
    console.log(`Adding ${notesToAdd.length} new notes...`);

    // Pre-validate to get detailed error reasons if addNotes fails
    const canAddResult = await ankiAction("canAddNotesWithErrorDetail", {
      notes: notesToAdd,
    });
    const errorMap = new Map();
    if (canAddResult.success) {
      canAddResult.data.forEach((res, index) => {
        if (!res.canAdd) errorMap.set(index, res.error);
      });
    }

    const addNotesResult = await ankiAction("addNotes", { notes: notesToAdd });

    if (!addNotesResult.success) {
      console.error(`Bulk addNotes operation failed: ${addNotesResult.error}`);
    }

    const results = addNotesResult.data;
    if (Array.isArray(results)) {
      let successfulAdds = 0;
      let failedAdds = 0;
      results.forEach((result, index) => {
        const note = notesToAdd[index];
        const identifyingField = Object.values(note.fields)[0];
        if (result !== null) {
          successfulAdds++;
        } else {
          failedAdds++;
          const reason = errorMap.get(index) || "Unknown reason (likely duplicate or missing field)";
          console.error(`- Failed to add note for "${identifyingField}": ${reason}`);
        }
      });
      console.log(
        `Added ${successfulAdds} notes. Failed to add ${failedAdds} notes.`,
      );
    }
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
