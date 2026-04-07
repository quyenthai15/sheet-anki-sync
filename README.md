# 🎴 AnkiSync: General Purpose CSV-to-Anki Engine

A lightweight, OAuth-free system to sync Google Sheets (via Published CSV) with Anki. Designed for efficiency and portability.

## 🚀 How to Share & Setup

### 1. Prerequisites (For everyone)
- **Node.js**: [Download and install](https://nodejs.org/)
- **Anki**: [Download and install](https://apps.ankiweb.net/)
- **AnkiConnect Add-on**: In Anki, go to `Tools -> Add-ons -> Get Add-ons` and enter code: `2055492159`. Restart Anki.

### 2. Prepare Google Sheet
1. **Template:** Open the [Study Template Spreadsheet](YOUR_TEMPLATE_URL_HERE) and go to `File -> Make a copy`.
2. **Publish:** Go to `File -> Share -> Publish to the web`.
3. Select `Entire Document` (or your specific sheet) and change format to **Comma-separated values (.csv)**.
4. Click **Publish** and copy the generated URL.
5. **Apps Script:** (Optional but recommended)
   - Go to `Extensions -> Apps Script`.
   - In Project Settings (gear icon), add a **Script Property** with Name: `GEMINI_API_KEY` and your [Google Gemini API Key](https://aistudio.google.com/app/apikey).
   - This script generates readings, sentences, and translations automatically!

### 3. Initialize Project
```bash
git clone <your-repo-url>
cd anki-sync
npm install
npm run setup
```
The **Setup Wizard** will ask for:
- Your Published CSV URL.
- Your Anki Deck and Note Type name.
- Your field mapping (e.g., Map CSV "Expression" to Anki "Word").

### 4. Import Templates
- In `anki-sync/templates/`, double-click any `.apkg` files to import the necessary Note Types into Anki before syncing.

---

## 🛠 Usage

### Syncing Data to Anki
- **Dry Run:** (Preview changes without saving)
  ```bash
  npm run sync:dry
  ```
- **Standard Sync:** (Adds new cards only)
  ```bash
  npm run sync
  ```
- **Force Sync:** (Updates changed cards + adds new ones)
  ```bash
  npm run sync:force
  ```

### 🛡️ Safety & Features
1. **Pre-flight Validation:** Automatically checks if your CSV headers and Anki fields match before doing anything.
2. **Smart Diffing:** Updates existing cards ONLY if the spreadsheet data has actually changed.
3. **Bulk Actions:** Uses AnkiConnect's bulk APIs for high-performance syncing.
4. **Automatic TTS:** Specify `"audio_field"` and/or `"sentence_audio_field"` in `config.json`. The script will generate audio for the primary word and the **JP sentence** automatically.

### 🎙️ Audio Migration
If you want to add sentence audio to existing cards:
1. Ensure your Anki Note Type has a dedicated field (e.g., `SentenceAudio`).
2. Update `config.json` with `"sentence_audio_field": "SentenceAudio"`.
3. Run `npm run sync:force`.
4. **Important:** Edit your Anki **Card Template** to include `{{SentenceAudio}}` (or your chosen field name) to hear it on your cards.

### 💻 Windows Compatibility
This project is fully compatible with Windows, macOS, and Linux. Always use `npm run <script>` for the best experience.
