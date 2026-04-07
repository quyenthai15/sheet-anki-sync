const fs = require('fs');
const path = require('path');
const readline = require('readline');
const axios = require('axios');
const { parse } = require('csv-parse/sync');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const ANKI_URL = "http://127.0.0.1:8765";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function ankiAction(action, params = {}) {
  try {
    const res = await axios.post(ANKI_URL, { action, version: 6, params });
    if (res.data.error) return null;
    return res.data.result;
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log("--- AnkiSync Setup Wizard ---");

  let config = {};
  if (fs.existsSync(CONFIG_PATH)) {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH));
    console.log("Existing configuration found.");
  }

  // 1. Google Sheet CSV URL
  const csvUrl = await question(`Enter your Published Google Sheet CSV URL [${config.sheet_csv_url || ''}]: `);
  if (csvUrl) config.sheet_csv_url = csvUrl;

  if (!config.sheet_csv_url) {
    console.error("CSV URL is required.");
    process.exit(1);
  }

  // 2. Fetch CSV Headers
  console.log("Fetching CSV headers...");
  let headers = [];
  try {
    const res = await axios.get(config.sheet_csv_url);
    const records = parse(res.data, { columns: true, to: 1, skip_empty_lines: true });
    if (records.length > 0) {
      headers = Object.keys(records[0]);
      console.log("Detected headers:", headers.join(', '));
    }
  } catch (e) {
    console.warn("Could not fetch CSV. Check your URL or internet connection.");
  }

  // 3. Anki Deck
  const decks = await ankiAction('deckNames');
  if (decks) {
    console.log("Available Decks:", decks.join(', '));
  } else {
    console.warn("Anki is not running. Using manual entry.");
  }
  const deck = await question(`Enter Anki Deck name [${config.anki_deck || ''}]: `);
  if (deck) config.anki_deck = deck;

  // 4. Anki Note Type
  const models = await ankiAction('modelNames');
  if (models) {
    console.log("Available Note Types:", models.join(', '));
  }
  const model = await question(`Enter Anki Note Type (Model) [${config.anki_model || ''}]: `);
  if (model) config.anki_model = model;

  // 5. Mapping
  if (headers.length > 0 && config.anki_model) {
    const modelFields = await ankiAction('modelFieldNames', { modelName: config.anki_model });
    if (modelFields) {
      console.log("\nMapping CSV Headers to Anki Fields:");
      console.log("Anki Fields:", modelFields.join(', '));
      
      const newMapping = {};
      for (const header of headers) {
        const mappedField = await question(`Map CSV [${header}] to Anki field (leave blank to skip): `);
        if (mappedField) newMapping[header] = mappedField;
      }
      if (Object.keys(newMapping).length > 0) config.mapping = newMapping;

      const audioField = await question(`Which Anki field is for Audio? [${config.audio_field || ''}]: `);
      if (audioField) config.audio_field = audioField;
    }
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log("\n--- Configuration Saved! ---");
  console.log("You can now run 'npm run sync' to start syncing.");
  rl.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
