#!/bin/bash

echo "Starting Anki Sync Setup (CSV Edition)..."

# 1. Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install it from https://nodejs.org/"
    exit 1
fi

# 2. Install dependencies
echo "Installing local dependencies..."
npm install

# 3. Clasp Login (for Apps Script backup)
echo "Checking Clasp login..."
if ! npx clasp login --status &> /dev/null; then
    echo "Please login to Clasp to back up your Apps Script."
    npx clasp login
fi

# 4. Final Instructions
echo "----------------------------------------------------"
echo "SETUP INSTRUCTIONS:"
echo "1. Google Sheet: Publish your sheet to the web as CSV."
echo "2. Config: Paste the CSV URL into 'config.json'."
echo "3. Anki: Ensure Anki is open with AnkiConnect installed."
echo "4. Sync: Run 'npm run sync'."
echo "----------------------------------------------------"
echo "APPS SCRIPT BACKUP:"
echo "If you want to back up your J-Study Tools script, run:"
echo "npx clasp clone <scriptId> --dir apps-script"
echo "----------------------------------------------------"
