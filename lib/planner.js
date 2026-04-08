const { buildNoteFields, getFieldChanges } = require('./diff');
const { buildAudioEntries } = require('./audio');
const { showProgress } = require('./progress');

/**
 * Build sync plan: classify each CSV row as add/update/skip and return collections.
 * @param {array} records - Parsed CSV records
 * @param {object} config - Config object
 * @param {Map} ankiDataMap - Map of existing notes by primary key
 * @returns {Promise<{notesToAdd, notesToUpdate}>}
 */
async function buildSyncPlan(records, config, ankiDataMap) {
  const notesToAdd = [];
  const notesToUpdate = [];

  console.log("Analyzing changes...");
  const firstSheetCol = Object.keys(config.mapping)[0];
  const firstAnkiField = config.mapping[firstSheetCol];
  const sentenceSourceCol = config.sentence_source_col || "JP sentence";
  const sentenceAnkiField = config.mapping[sentenceSourceCol];

  showProgress(0, records.length);

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    // Normalize primary key for lookup
    const word = (row[firstSheetCol] || "").trim().normalize('NFC');
    if (!word) {
      showProgress(i + 1, records.length);
      continue;
    }

    const fields = buildNoteFields(row, config.mapping);
    const existingNote = ankiDataMap.get(word);

    if (existingNote) {
      if (config.force_sync) {
        const audio = buildAudioEntries(config, fields, firstAnkiField, existingNote);
        const fieldsWithAudio = { ...fields };

        // Append audio tags to fields if they are being added
        audio.forEach(a => {
          a.fields.forEach(f => {
            const currentVal = fieldsWithAudio[f] || existingNote.fields[f] || "";
            const tag = `[sound:${a.filename}]`;
            if (!currentVal.includes(tag)) {
              fieldsWithAudio[f] = (currentVal + " " + tag).trim();
            }
          });
        });

        const fieldChanges = getFieldChanges(fieldsWithAudio, existingNote);
        const needsAudio = audio.some(a => a.fields.includes(config.audio_field));
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
      showProgress(i + 1, records.length);
      continue;
    }

    const audio = buildAudioEntries(config, fields, firstAnkiField, existingNote);
    const fieldsWithAudio = { ...fields };
    audio.forEach(a => {
      a.fields.forEach(f => {
        const currentVal = fieldsWithAudio[f] || "";
        const tag = `[sound:${a.filename}]`;
        fieldsWithAudio[f] = (currentVal + " " + tag).trim();
      });
    });

    notesToAdd.push({
      deckName: config.anki_deck,
      modelName: config.anki_model,
      word,
      fields: fieldsWithAudio,
      audio: audio.length > 0 ? audio : undefined,
      options: { allowDuplicate: false },
      tags: ["csv-sync"],
    });
    showProgress(i + 1, records.length);
  }

  return { notesToAdd, notesToUpdate };
}

module.exports = { buildSyncPlan };
