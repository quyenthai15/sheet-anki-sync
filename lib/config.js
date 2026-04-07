const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('config.json not found!');
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH));

  config.force_sync = process.argv.includes('--force') || process.argv.includes('--forceUpdate');
  config.dry_run = process.argv.includes('--dry-run');

  if (config.force_sync) console.log('--- Force Sync Enabled ---');
  if (config.dry_run) console.log('--- DRY RUN MODE (No changes will be saved) ---');

  return config;
}

module.exports = { loadConfig };
