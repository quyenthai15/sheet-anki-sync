const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const axios = require('axios');
const http = require('http');
const url = require('url');
const open = require('open');

const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const CONFIG_PATH = path.join(__dirname, 'config.json');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

/**
 * Loads the configuration.
 */
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('config.json not found!');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH));
}

/**
 * Authenticates with Google Sheets API.
 */
async function authorize() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('credentials.json not found! Please download it from Google Cloud Console.');
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  }

  return getNewToken(oAuth2Client);
}

/**
 * Gets a new token from the browser.
 */
function getNewToken(oAuth2Client) {
  return new Promise((resolve, reject) => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });

    console.log('Authorize this app by visiting this url:', authUrl);
    open(authUrl);

    const server = http.createServer(async (req, res) => {
      try {
        if (req.url.indexOf('/oauth2callback') > -1) {
          const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
          const code = qs.get('code');
          res.end('Authentication successful! Please return to the console.');
          server.destroy();
          const { tokens } = await oAuth2Client.getToken(code);
          oAuth2Client.setCredentials(tokens);
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
          resolve(oAuth2Client);
        }
      } catch (e) {
        reject(e);
      }
    }).listen(3000, () => {
      // open(authUrl); // Already opened above
    });

    // Handle server shutdown
    server.destroy = function () {
      server.close();
    };
  });
}

/**
 * Syncs data from Google Sheets to Anki.
 */
async function sync() {
  const config = loadConfig();
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });

  console.log(`Fetching data from sheet: ${config.sheet_id}...`);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheet_id,
    range: `${config.sheet_name}!A:Z`,
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    console.log('No data found.');
    return;
  }

  const headers = rows[0];
  const data = rows.slice(1);

  console.log(`Found ${data.length} rows. Syncing to Anki...`);

  for (const row of data) {
    const note = {
      deckName: config.anki_deck,
      modelName: config.anki_model,
      fields: {},
      options: { allowDuplicate: false },
      tags: ["sheet-sync"]
    };

    // Apply custom mapping
    for (const [sheetCol, ankiField] of Object.entries(config.mapping)) {
      const colIndex = headers.indexOf(sheetCol);
      if (colIndex > -1) {
        note.fields[ankiField] = row[colIndex] || "";
      }
    }

    if (!note.fields[config.mapping[headers[0]]]) continue; // Skip if main field is empty

    try {
      await axios.post('http://localhost:8765', {
        action: 'addNote',
        version: 6,
        params: { note }
      });
      console.log(`Synced: ${row[0]}`);
    } catch (e) {
      if (e.response && e.response.data.error === 'cannot create note because it is a duplicate') {
        // Optional: Update existing note instead of just skipping
        // console.log(`Skipping duplicate: ${row[0]}`);
      } else {
        console.error(`Error syncing ${row[0]}:`, e.message);
      }
    }
  }

  console.log('Sync complete!');
}

sync().catch(console.error);
