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
  return JSON.parse(fs.readFileSync(CONFIG_PATH));
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
        timeout: 30000,
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
 * Get all existing values for the primary field in the target deck.
 * Uses chunking to prevent "socket hang up" on large decks.
 */
async function getExistingWords(deck, model, fieldName) {
  console.log(`Checking Anki deck "${deck}" for existing cards...`);
  const noteIds = await ankiAction("findNotes", { query: `deck:"${deck}"` });
  if (noteIds.length === 0) return new Set();

  const existing = new Set();
  const chunkSize = 500; // Process 500 notes at a time
  
  for (let i = 0; i < noteIds.length; i += chunkSize) {
    const chunk = noteIds.slice(i, i + chunkSize);
    const notesInfo = await ankiAction("notesInfo", { notes: chunk });
    notesInfo.forEach((info) => {
      if (info.modelName === model && info.fields[fieldName]) {
        existing.add(info.fields[fieldName].value.trim());
      }
    });
  }
  
  return existing;
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
    console.error(
      "Error: Please provide a valid sheet_csv_url in config.json.",
    );
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

  // 3. Diff with Anki
  const existingWords = await getExistingWords(
    config.anki_deck,
    config.anki_model,
    firstAnkiField,
  );

  // 4. Prepare notes
  const notesToAdd = [];
  for (const row of records) {
    const word = (row[firstSheetCol] || "").trim();
    if (!word || existingWords.has(word)) continue;

    const fields = {};
    for (const [sheetCol, ankiField] of Object.entries(config.mapping)) {
      fields[ankiField] = row[sheetCol] || "";
    }

    notesToAdd.push({
      deckName: config.anki_deck,
      modelName: config.anki_model,
      fields: fields,
      options: { allowDuplicate: false },
      tags: ["csv-sync"],
    });
  }

  if (notesToAdd.length === 0) {
    console.log("Everything is already in Anki. Nothing to sync!");
    return;
  }

  // 5. Bulk Add
  console.log(`Adding ${notesToAdd.length} new notes to Anki...`);
  const results = await ankiAction("addNotes", { notes: notesToAdd });
  const successCount = results.filter((id) => id !== null).length;
  console.log(`Successfully synced ${successCount} notes!`);
}

sync().catch((err) => {
  console.error("Sync failed:", err.message);
});
