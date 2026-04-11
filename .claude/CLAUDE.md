# AnkiSync Project Mandates

This document takes absolute precedence over general workflows. All future modifications to this repository MUST adhere to these technical standards and architectural patterns.

## 🏗️ Architecture: CSV-to-Anki Engine
- **Local-First & OAuth-Free:** The system uses a **Published Google Sheet CSV URL** for data retrieval. Do NOT re-introduce Google Cloud SDKs or OAuth authentication flows.
- **Single Source of Truth:** All configuration (CSV URL, Deck, Model, Mapping) resides in `config.json`.
- **AnkiConnect Integration:** The bridge to Anki is `AnkiConnect` (Port 8765). Use a custom `http.Agent` with `keepAlive: false` to prevent `socket hang up` errors during bulk operations.

## 🛡️ Core Safety & Validation Rules
- **Pre-flight Validation:** Every sync operation MUST first validate:
    1. **CSV Headers:** Do they match the keys in `config.json` mapping?
    2. **Anki Schema:** Do the Deck, Note Type, and all mapped Fields exist in the local Anki database?
- **Smart Diffing:** Updates (`--force`) MUST only occur if the CSV data is strictly different from the existing Anki field values.
- **Audio Protection:** Never re-download or overwrite an `audio_field` if it already contains a valid `[sound:...]` tag.
- **Dry Run First:** Always support a `--dry-run` flag to preview additions and updates without mutating the Anki database.

## ⚡ Performance Standards
- **Bulk Operations:** Always use `addNotes` (plural) and `multi` actions. Never send individual `addNote` requests in a loop for large datasets.
- **Update Logic:** The `updateNotes` action is NOT supported in standard AnkiConnect versions. Use the `multi` action with `updateNoteFields` for batch updates.
- **Chunking:** When querying large decks (e.g., `notesInfo`), process in chunks of 500 to avoid memory or connection timeouts.

## 📂 Portability & Security
- **Credential Protection:** `credentials.json`, `token.json`, and `.env` are strictly blacklisted via `.gitignore`. Never commit these files.
- **Backup Workflow:** 
    - Card templates are stored as `.apkg` in `/templates`.
    - Add-on lists are generated as text files in `/backups`.
    - Google Apps Script is managed via `clasp` in `/apps-script`.

## 🛠️ Command Reference
- `npm run sync`: Standard sync (Adds new cards only).
- `npm run sync:force`: Smart Update (Updates changed cards + adds new).
- `npm run sync:dry`: Preview mode.
- `npm run backup:all`: Full workflow backup (Templates, Add-ons, Apps Script).
- `npm run cleanup`: Removes duplicate audio tags from the specified deck.
- `npm run export-templates`: Overwrites current .apkg templates with latest Anki changes.
- `npm run list-addons`: Generates a list of installed Anki add-ons.
