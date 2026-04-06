# 🎴 AnkiSync: Portable Study Workflow (CSV Edition)

A simple, fast, and OAuth-free system to sync Google Sheets data with Anki.

## 🚀 First-Time Setup (On a New Mac)

### 1. Prerequisites
- **Node.js**: [Download and install](https://nodejs.org/)
- **Anki**: [Download and install](https://apps.ankiweb.net/)
- **AnkiConnect Add-on**: In Anki, go to `Tools -> Add-ons -> Get Add-ons` and enter code: `2055492159`. Restart Anki.

### 2. Prepare Google Sheet
1. In your Google Sheet, go to `File -> Share -> Publish to the web`.
2. Select `Entire Document` (or your specific sheet) and change the format to **Comma-separated values (.csv)**.
3. Click **Publish** and copy the generated URL.

### 3. Initialize Project
```bash
git clone <your-repo-url>
cd anki-sync
./setup.sh
```

### 4. Configure
1. Open `config.json` and paste your **Published CSV URL** into `"sheet_csv_url"`.
2. Update the `"mapping"` section to match your Google Sheet headers.

### 5. Restore Templates & Add-ons
- **Templates:** In `anki-sync/templates/`, double-click any `.apkg` files to import your Note Types.
- **Add-ons:** Check `anki-sync/backups/addons_list.txt` and install by ID in Anki.

---

## 🛠 Usage

### Syncing Data to Anki
- **Dry Run:** (See what *would* happen without making changes)
  ```bash
  npm run sync:dry
  ```
- **Standard Sync:** (Adds new cards, with full validation)
  ```bash
  npm run sync
  ```
- **Force Sync:** (Updates changed cards + adds new ones)
  ```bash
  npm run sync:force
  ```
- **Force Dry Run:**
  ```bash
  npm run sync:force-dry
  ```

### 🛡️ Safety Features
1. **Pre-flight Validation:** The script automatically checks:
   - Does your Google Sheet have all the column names listed in `config.json`?
   - Does the Anki Deck and Note Type exist?
   - Do all mapped Anki fields exist on your Note Type?
2. **Smart Diffing:** When running a "Force Sync," the script only updates cards if the spreadsheet data is actually different from what's already in Anki.
3. **Bulk Actions:** Uses AnkiConnect's bulk APIs to ensure fast and reliable updates even for thousands of cards.

### 🎙️ Automatic TTS Audio
If you specify an `"audio_field"` in `config.json` (e.g., `"Audio"`), the script will automatically:
1. Generate Japanese audio for your primary word using Google Translate.
2. Download and attach the `.mp3` file to your Anki card.
3. No audio is needed in your Google Sheet—it's handled entirely by the sync script!

### Backing up Apps Script
If you want to keep a local copy of your Google Apps Script:
```bash
npx clasp login
npx clasp clone <YOUR_SCRIPT_ID> --dir apps-script
```
