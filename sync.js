const axios = require('axios');
const { parse } = require("csv-parse/sync");

const { loadConfig } = require('./lib/config');
const { ankiAction, getAnkiDataMap } = require('./lib/anki');
const { validateSetup } = require('./lib/validate');
const { buildAudioEntries } = require('./lib/audio');
const { buildNoteFields, getFieldChanges } = require('./lib/diff');

function showProgress(current, total) {
  const barLength = 40;
  const progress = Math.min(Math.max(current / total, 0), 1);
  const filledLength = Math.round(barLength * progress);
  const bar = '█'.repeat(filledLength) + '-'.repeat(barLength - filledLength);
  process.stdout.write(`\r[${bar}] ${Math.round(progress * 100)}% (${current}/${total})`);
  if (current === total) process.stdout.write('\n');
}

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

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    // Normalize primary key for lookup
    const word = (row[firstSheetCol] || "").trim().normalize('NFC');
    if (!word) continue;

    const fields = buildNoteFields(row, config.mapping);
    const existingNote = ankiDataMap.get(word);

    if (existingNote) {
      if (config.force_sync) {
        const audio = buildAudioEntries(config, fields, firstAnkiField, existingNote);
        const fieldsWithAudio = { ...fields };
        
        // Append audio tags to fields if they are being added
        audio.forEach(a => {
          a.fields.forEach(f => {
            if (fieldsWithAudio[f] !== undefined) {
              fieldsWithAudio[f] += ` [sound:${a.filename}]`;
            }
          });
        });

        const fieldChanges = getFieldChanges(fieldsWithAudio, existingNote);
        const needsAudio = audio.some(a => a.fields.includes(config.audio_field));
        const sentenceSourceCol = config.sentence_source_col || "JP sentence";
        const sentenceAnkiField = config.mapping[sentenceSourceCol];
        const japaneseSentence = fields[sentenceAnkiField];
        const needsSentenceAudio = audio.some(a => a.fields.includes(config.sentence_audio_field));

        if (fieldChanges || needsAudio || needsSentenceAudio) {
          notesToUpdate.push({
            id: existingNote.noteId,
            word,
            fields: fieldsWithAudio,
            fieldChanges,
            audio: audio.length > 0 ? audio : undefined,
            needsAudio,
            needsSentenceAudio
          });
        }
      }
      continue;
    }

    const audio = buildAudioEntries(config, fields, firstAnkiField, existingNote);
    notesToAdd.push({
      deckName: config.anki_deck,
      modelName: config.anki_model,
      word,
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

    if (notesToUpdate.length > 0) {
      console.log("\nDETAILED CHANGES (UPDATES):");
      notesToUpdate.forEach(u => {
        console.log(`[Update] "${u.word}":`);
        if (u.fieldChanges) {
          Object.entries(u.fieldChanges).forEach(([field, val]) => {
            console.log(`  - ${field}: "${val.old}" -> "${val.new}"`);
          });
        }
        if (u.needsAudio) console.log("  - Adding Word Audio");
        if (u.needsSentenceAudio) console.log("  - Adding Sentence Audio");
      });
    }

    if (notesToAdd.length > 0) {
      console.log("\nDETAILED CHANGES (ADDITIONS):");
      notesToAdd.forEach(n => {
        console.log(`[Add] "${n.word}"`);
      });

      console.log("\nValidating additions (first 500)...");
      const checkChunk = notesToAdd.slice(0, 500);
      const canAddResult = await ankiAction("canAddNotesWithErrorDetail", { notes: checkChunk });
      if (canAddResult.success) {
        canAddResult.data.forEach((res, index) => {
          if (!res.canAdd) {
            console.warn(`[!] Cannot add "${checkChunk[index].word}": ${res.error}`);
          }
        });
      }
    }

    console.log("\nNo changes were made to Anki.");
    return;
  }

  const WRITE_CHUNK_SIZE = 100;

  // 6. Execute updates in chunks
  if (notesToUpdate.length > 0) {
    console.log(`Updating ${notesToUpdate.length} cards...`);
    let updatedCount = 0;
    showProgress(0, notesToUpdate.length);

    for (let i = 0; i < notesToUpdate.length; i += WRITE_CHUNK_SIZE) {
      const rawChunk = notesToUpdate.slice(i, i + WRITE_CHUNK_SIZE);
      const actions = [];
      
      rawChunk.forEach(n => {
        // 1. Add storeMediaFile actions if needed
        if (n.audio) {
          n.audio.forEach(a => {
            actions.push({
              action: "storeMediaFile",
              params: { filename: a.filename, url: a.url }
            });
          });
        }
        // 2. Add updateNoteFields action
        actions.push({
          action: "updateNoteFields",
          params: {
            note: { id: n.id, fields: n.fields }
          }
        });
      });

      const multiResult = await ankiAction("multi", { actions });
      if (!multiResult.success) {
        console.error(`\nFailed to execute update batch starting at ${i}: ${multiResult.error}`);
      } else {
        updatedCount += rawChunk.length;
      }
      showProgress(updatedCount, notesToUpdate.length);
    }
    console.log(`Update complete. ${updatedCount} notes updated.`);
  }

  // 7. Execute additions in chunks
  if (notesToAdd.length > 0) {
    console.log(`Adding ${notesToAdd.length} new notes...`);
    
    let successfulAdds = 0;
    let failedAdds = 0;
    showProgress(0, notesToAdd.length);

    for (let i = 0; i < notesToAdd.length; i += WRITE_CHUNK_SIZE) {
      const chunk = notesToAdd.slice(i, i + WRITE_CHUNK_SIZE);
      
      const canAddResult = await ankiAction("canAddNotesWithErrorDetail", { notes: chunk });
      const errorMap = new Map();
      if (canAddResult.success) {
        canAddResult.data.forEach((res, index) => {
          if (!res.canAdd) errorMap.set(index, res.error);
        });
      }

      const addNotesResult = await ankiAction("addNotes", { notes: chunk });
      if (!addNotesResult.success) {
        console.error(`\nBatch addNotes operation failed at ${i}: ${addNotesResult.error}`);
        failedAdds += chunk.length;
        showProgress(successfulAdds + failedAdds, notesToAdd.length);
        continue;
      }

      const results = addNotesResult.data;
      if (Array.isArray(results)) {
        results.forEach((result, index) => {
          if (result !== null) {
            successfulAdds++;
          } else {
            failedAdds++;
            const reason = errorMap.get(index) || "Unknown reason (likely duplicate or missing field)";
            console.error(`\n- Failed to add note for "${chunk[index].word}": ${reason}`);
          }
        });
      }
      showProgress(successfulAdds + failedAdds, notesToAdd.length);
    }
    console.log(`Added ${successfulAdds} notes. Failed to add ${failedAdds} notes.`);
  }

  if (notesToAdd.length === 0 && notesToUpdate.length === 0) {
    console.log('No changes detected. Everything is already in sync!');
  } else {
    console.log('Sync complete!');
  }
}

sync().catch((err) => {
  console.error("\nSync failed:", err.message);
});
