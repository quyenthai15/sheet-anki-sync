const axios = require('axios');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ANKI_URL = "http://127.0.0.1:8765";
const CONFIG_PATH = path.join(__dirname, 'config.json');
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const TEMP_DECK = "__TEMP_EXPORT_DECK__";

const agent = new http.Agent({ keepAlive: false });

async function ankiAction(action, params = {}) {
  try {
    const res = await axios.post(ANKI_URL, { action, version: 6, params }, { 
      timeout: 60000,
      httpAgent: agent 
    });
    if (res.data.error) throw new Error(res.data.error);
    return res.data.result;
  } catch (e) {
    if (e.code === "ECONNRESET" || e.message.includes("hang up")) {
      throw new Error('Anki connection dropped. Close all extra windows and try again.');
    }
    throw e;
  }
}

/**
 * Creates a tiny .apkg containing ONLY the Note Type (Model) 
 * by using a temporary deck and one dummy card.
 */
async function exportModelOnly(modelName, fileName) {
  const exportPath = path.join(TEMPLATES_DIR, fileName);
  console.log(`- Preparing lean export for Note Type: "${modelName}"...`);

  try {
    // 1. Create a clean temp deck
    await ankiAction('createDeck', { deck: TEMP_DECK });

    // 2. Get fields for this model to create a valid dummy note
    const fields = await ankiAction('modelFieldNames', { modelName });
    const dummyFields = {};
    fields.forEach(f => dummyFields[f] = "TEMPLATE_HOLDER");

    // 3. Add one dummy note to the temp deck
    const noteId = await ankiAction('addNote', {
      note: {
        deckName: TEMP_DECK,
        modelName: modelName,
        fields: dummyFields,
        tags: ["template-export"]
      }
    });

    // 4. Export the temp deck
    console.log(`  > Saving to ${fileName}...`);
    await ankiAction('exportPackage', {
      deck: TEMP_DECK,
      path: exportPath,
      includeSched: false
    });

    // 5. Clean up: Delete the temp deck (and the note inside it)
    await ankiAction('deleteDecks', { decks: [TEMP_DECK], cardsToo: true });
    
    console.log(`  ✅ Done! File size: ${(fs.statSync(exportPath).size / 1024).toFixed(1)} KB`);
  } catch (e) {
    console.error(`  ❌ Failed to export "${modelName}":`, e.message);
    // Attempt cleanup even on failure
    await ankiAction('deleteDecks', { decks: [TEMP_DECK], cardsToo: true }).catch(() => {});
  }
}

async function run() {
  if (!fs.existsSync(CONFIG_PATH)) return console.error('config.json not found!');
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH));
  if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR);

  console.log('🚀 Starting LEAN Template Export...\n');

  // 1. Export the main Sheet Note Type
  if (config.anki_model) {
    await exportModelOnly(config.anki_model, 'sheet_template.apkg');
  }

  // 2. Try to find and export Yomitan Note Type
  const allModels = await ankiAction('modelNames');
  const yomitanModel = allModels.find(m => m.toLowerCase().includes('yomitan'));
  
  if (yomitanModel) {
    await exportModelOnly(yomitanModel, 'Yomitan_template.apkg');
  } else {
    console.log('! Yomitan Note Type not found, skipping.');
  }

  console.log('\n✨ Backups are now ultra-lean and card-free!');
}

run().catch(err => console.error("Export failed:", err.message));
