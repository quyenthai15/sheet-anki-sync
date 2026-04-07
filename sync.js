const axios = require('axios');
const { parse } = require("csv-parse/sync");

const { loadConfig } = require('./lib/config');
const { ankiAction, getAnkiDataMap } = require('./lib/anki');
const { validateSetup } = require('./lib/validate');
const { buildAudioEntries } = require('./lib/audio');
const { buildNoteFields, hasFieldChanges } = require('./lib/diff');

async function sync() {
  const config = loadConfig();

  // 1. Fetch CSV
  console.log("Fetching CSV data from Google Sheets...");
  const res = await axios.get(config.sheet_csv_url);
  const records = parse(res.data, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (records.length === 0) {
    console.log("No data found in CSV.");
    return;
  }

  // 2. Validate everything
  await validateSetup(config, Object.keys(records[0]));

  // 3. Get existing notes for smart diffing
  const firstSheetCol = Object.keys(config.mapping)[0];
  const firstAnkiField = config.mapping[firstSheetCol];
  const ankiDataMap = await getAnkiDataMap(config.anki_deck, config.anki_model, firstAnkiField);

  // 4. Prepare updates and additions
  const notesToAdd = [];
  const notesToUpdate = [];

  for (const row of records) {
    const word = (row[firstSheetCol] || "").trim();
    if (!word) continue;

    const fields = buildNoteFields(row, config.mapping);
    const existingNote = ankiDataMap.get(word);
    const audio = buildAudioEntries(config, fields, firstAnkiField, existingNote);

    if (existingNote) {
      if (config.force_sync) {
        const needsAudio = config.audio_field && !existingNote.fields[config.audio_field]?.includes('[sound:');
        const sentenceSourceCol = config.sentence_source_col || "JP sentence";
        const japaneseSentence = fields[config.mapping[sentenceSourceCol]];
        const needsSentenceAudio = config.sentence_audio_field && japaneseSentence &&
          !existingNote.fields[config.sentence_audio_field]?.includes("[sound:");

        if (hasFieldChanges(fields, existingNote) || needsAudio || needsSentenceAudio) {
          notesToUpdate.push({
            id: existingNote.noteId,
            fields,
            audio: audio.length > 0 ? audio : undefined,
          });
        }
      }
      continue;
    }

    notesToAdd.push({
      deckName: config.anki_deck,
      modelName: config.anki_model,
      fields,
      audio: audio.length > 0 ? audio : undefined,
      options: { allowDuplicate: false },
      tags: ["csv-sync"],
    });
  }

  // 5. Dry run summary
  if (config.dry_run) {
    console.log(`\nDRY RUN SUMMARY:`);
    console.log(`- New cards to add: ${notesToAdd.length}`);
    console.log(`- Cards with changes to update: ${notesToUpdate.length}`);

    if (notesToAdd.length > 0) {
      console.log("\nValidating additions...");
      const canAddResult = await ankiAction("canAddNotesWithErrorDetail", { notes: notesToAdd });
      if (canAddResult.success) {
        canAddResult.data.forEach((res, index) => {
          if (!res.canAdd) {
            const identifyingField = Object.values(notesToAdd[index].fields)[0];
            console.warn(`[!] Cannot add "${identifyingField}": ${res.error}`);
          }
        });
      }
    }

    console.log("\nNo changes were made to Anki.");
    return;
  }

  // 6. Execute updates
  if (notesToUpdate.length > 0) {
    console.log(`Updating ${notesToUpdate.length} cards...`);
    const updateNotesResult = await ankiAction("updateNotes", { notes: notesToUpdate });
    if (!updateNotesResult.success) {
      console.error(`Failed to execute bulk updates: ${updateNotesResult.error}`);
    } else {
      console.log(`Update complete.`);
    }
  }

  // 7. Execute additions
  if (notesToAdd.length > 0) {
    console.log(`Adding ${notesToAdd.length} new notes...`);

    const canAddResult = await ankiAction("canAddNotesWithErrorDetail", { notes: notesToAdd });
    const errorMap = new Map();
    if (canAddResult.success) {
      canAddResult.data.forEach((res, index) => {
        if (!res.canAdd) errorMap.set(index, res.error);
      });
    }

    const addNotesResult = await ankiAction("addNotes", { notes: notesToAdd });
    if (!addNotesResult.success) {
      console.error(`Bulk addNotes operation failed: ${addNotesResult.error}`);
    }

    const results = addNotesResult.data;
    if (Array.isArray(results)) {
      let successfulAdds = 0;
      let failedAdds = 0;
      results.forEach((result, index) => {
        const identifyingField = Object.values(notesToAdd[index].fields)[0];
        if (result !== null) {
          successfulAdds++;
        } else {
          failedAdds++;
          const reason = errorMap.get(index) || "Unknown reason (likely duplicate or missing field)";
          console.error(`- Failed to add note for "${identifyingField}": ${reason}`);
        }
      });
      console.log(`Added ${successfulAdds} notes. Failed to add ${failedAdds} notes.`);
    }
  }

  if (notesToAdd.length === 0 && notesToUpdate.length === 0) {
    console.log('No changes detected. Everything is already in sync!');
  } else {
    console.log('Sync complete!');
  }
}

sync().catch((err) => {
  console.error("Sync failed:", err.message);
});
