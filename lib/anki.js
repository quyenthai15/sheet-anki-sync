const axios = require('axios');
const http = require('http');

const ANKI_URL = "http://127.0.0.1:8765";

// Use a dedicated agent to prevent socket hang-ups/reuse issues
const agent = new http.Agent({ keepAlive: false });

async function ankiAction(action, params = {}) {
  try {
    const res = await axios.post(
      ANKI_URL,
      { action, version: 6, params },
      { timeout: 60000, httpAgent: agent },
    );

    if (res.data.error) {
      return { success: false, error: res.data.error, data: null };
    }
    return { success: true, data: res.data.result, error: null };
  } catch (e) {
    if (e.code === "ECONNREFUSED") {
      return {
        success: false,
        error: "Anki is not running or AnkiConnect is not installed.",
        data: null,
      };
    }
    return {
      success: false,
      error: e.message || "An unknown network error occurred.",
      data: null,
    };
  }
}

async function getAnkiDataMap(deck, model, primaryAnkiField) {
  console.log(`Fetching current cards from Anki...`);
  const findNotesResult = await ankiAction("findNotes", {
    query: `deck:"${deck}"`,
  });
  if (!findNotesResult.success) {
    throw new Error(
      `Failed to find notes in deck "${deck}": ${findNotesResult.error}`,
    );
  }
  const noteIds = findNotesResult.data;

  const notesMap = new Map();
  const chunkSize = 500;

  for (let i = 0; i < noteIds.length; i += chunkSize) {
    const chunk = noteIds.slice(i, i + chunkSize);
    const notesInfoResult = await ankiAction("notesInfo", { notes: chunk });
    if (!notesInfoResult.success) {
      throw new Error(`Failed to get info for notes: ${notesInfoResult.error}`);
    }

    notesInfoResult.data.forEach((info) => {
      if (info.modelName === model && info.fields[primaryAnkiField]) {
        const primaryValue = info.fields[primaryAnkiField].value.trim();
        const fields = {};
        Object.keys(info.fields).forEach(
          (f) => (fields[f] = info.fields[f].value.trim()),
        );
        notesMap.set(primaryValue, { noteId: info.noteId, fields });
      }
    });
  }
  return notesMap;
}

module.exports = { ankiAction, getAnkiDataMap };
