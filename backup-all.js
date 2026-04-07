const { execSync } = require('child_process');

console.log('🚀 Starting FULL WORKFLOW BACKUP...\n');

try {
  // 1. Export Anki Templates (.apkg)
  console.log('--- Step 1: Exporting Anki Templates ---');
  execSync('npm run export-templates', { stdio: 'inherit' });

  // 2. Generate Add-on List
  console.log('\n--- Step 2: Generating Anki Add-on List ---');
  execSync('npm run list-addons', { stdio: 'inherit' });

  // 3. Pull Apps Script Logic (clasp)
  console.log('\n--- Step 3: Backing up Google Apps Script ---');
  try {
    execSync('npm run pull', { stdio: 'inherit' });
  } catch (e) {
    console.log('! Skipping Apps Script backup (clasp might not be initialized).');
    console.log('  Run "npx clasp login" and "npx clasp clone <id> --dir apps-script" first.');
  }

  console.log('\n✅ ALL BACKUPS COMPLETE! Your repository is now up to date.');
} catch (error) {
  console.error('\n❌ Backup failed. See details above.');
}
