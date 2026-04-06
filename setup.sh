#!/bin/bash

echo "Starting Anki Sync Setup..."

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

# 4. Instructions
echo "----------------------------------------------------"
echo "SETUP INSTRUCTIONS:"
echo "1. Anki Add-on: Install AnkiConnect (ID: 2055492159)."
echo "2. Google Cloud: Go to https://console.cloud.google.com/"
echo "   - Create a project."
echo "   - Enable Google Sheets API."
echo "   - Create OAuth 2.0 Client ID (Desktop app)."
echo "   - Download JSON and save it as 'credentials.json' in this folder."
echo "3. Update 'config.json' with your Sheet ID and Deck name."
echo "4. Run 'node sync.js' to start syncing."
echo "----------------------------------------------------"
echo "APPS SCRIPT BACKUP:"
echo "If you want to back up your J-Study Tools script, run:"
echo "npx clasp clone <scriptId> --dir apps-script"
echo "----------------------------------------------------"
