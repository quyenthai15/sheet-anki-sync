const fs = require('fs');
const path = require('path');
const os = require('os');

const ANKI_PATH = path.join(os.homedir(), 'Library/Application Support/Anki2');
const ADDONS_PATH = path.join(ANKI_PATH, 'addons21');
const OUTPUT_FILE = path.join(__dirname, 'backups', 'addons_list.txt');

/**
 * Reads the Anki addons folder and extracts names/IDs
 */
function listAddons() {
  if (!fs.existsSync(ADDONS_PATH)) {
    console.error('Anki addons folder not found!');
    return;
  }

  const folders = fs.readdirSync(ADDONS_PATH);
  let output = "ANKI ADD-ONS LIST\n=================\n\n";

  folders.forEach(folder => {
    const metaPath = path.join(ADDONS_PATH, folder, 'meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        const name = meta.name || folder;
        // If the folder is numeric, it's the AnkiWeb ID
        const id = /^\d+$/.test(folder) ? folder : "Local/Manual";
        output += `- ${name} (ID: ${id})\n`;
      } catch (e) {
        output += `- ${folder} (Error reading meta.json)\n`;
      }
    }
  });

  fs.writeFileSync(OUTPUT_FILE, output);
  console.log(`Add-on list saved to: backups/addons_list.txt`);
  console.log(output);
}

listAddons();
