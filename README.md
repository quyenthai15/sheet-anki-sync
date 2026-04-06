# 🎴 AnkiSync: Portable Study Workflow

A customizable system to sync Google Sheets with Anki using Node.js, AnkiConnect, and Google Apps Script. 

## 🚀 First-Time Setup (On a New Mac)

### 1. Prerequisites
- **Node.js**: [Download and install](https://nodejs.org/)
- **Anki**: [Download and install](https://apps.ankiweb.net/)
- **AnkiConnect Add-on**: In Anki, go to `Tools -> Add-ons -> Get Add-ons` and enter code: `2055492159`. Restart Anki.

### 2. Clone and Initialize
```bash
git clone <your-repo-url>
cd anki-sync
chmod +x setup.sh
./setup.sh
```
*Note: This will install dependencies and create your `.env` file.*

### 3. Google Cloud Configuration
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project.
3. Enable **Google Sheets API**.
4. Go to **APIs & Services -> Credentials**.
5. Click **Create Credentials -> OAuth 2.0 Client ID** (Type: *Desktop App*).
6. Download the JSON, rename it to `credentials.json`, and move it to the `anki-sync/` folder.

### 4. Environment Variables
Open the `.env` file and fill in your details:
```bash
GEMINI_API_KEY=your_key_here
SHEET_ID=your_spreadsheet_id_here
```
### 5. Restore Templates & Add-ons
- **Templates:** In `anki-sync/templates/`, double-click any `.apkg` files. This imports your Note Types (card styles) into Anki.
- **Add-ons:** Check `anki-sync/backups/addons_list.txt`. Copy the numeric IDs and install them in Anki (`Tools -> Add-ons -> Get Add-ons`).
- **Configuration:** If you have custom config for an add-on (like AnkiConnect), update it in `Tools -> Add-ons -> Config`.

---

## 🛠 Usage

### Backup Your Setup
Before moving to a new Mac, run:
```bash
npm run list-addons
```
This saves a list of your installed add-ons to `backups/addons_list.txt`. Export your card templates (as `.apkg`) and save them in the `templates/` folder.

### Syncing Data to Anki
1. Ensure Anki is open.
...

2. Run the sync script:
```bash
node sync.js
```
*The first time you run this, it will open your browser to authorize access to your Google Sheet.*

### Backing up Apps Script (CLASP)
To pull your latest `J-Study Tools` script code from Google into this folder:
```bash
npx clasp login
npx clasp clone <YOUR_SCRIPT_ID> --dir apps-script
```
To push local changes back to Google:
```bash
npx clasp push
```

## ⚙️ Custom Mapping
You can change how spreadsheet columns map to Anki fields by editing `config.json`.
- **Key**: The exact header name in your Google Sheet.
- **Value**: The exact field name in your Anki Note Type.

```json
"mapping": {
  "Expression": "Word",
  "Reading": "Reading"
}
```

---

## 🔒 Security Note
Your `credentials.json`, `token.json`, and `.env` are automatically ignored by Git (via `.gitignore`) to keep your secrets safe. **Never commit these files.**
