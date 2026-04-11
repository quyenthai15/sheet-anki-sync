const { buildNoteFields, getFieldChanges } = require('./diff');
const { getAudioSyncPlan } = require('./audio');
const { showProgress } = require('./progress');

/**
 * Builds a sync plan by classifying each CSV record as add, update, or skip.
 */
async function buildSyncPlan(records, config, ankiDataMap) {
  const notesToAdd = [];
  const notesToUpdate = [];
  const firstCol = Object.keys(config.mapping)[0];

  console.log("Analyzing changes...");
  showProgress(0, records.length);

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const word = (row[firstCol] || "").trim().normalize('NFC');
    
    if (word) {
      const existing = ankiDataMap.get(word);
      const plan = processRecord(word, row, config, existing);
      
      if (plan?.type === 'add') notesToAdd.push(plan.data);
      if (plan?.type === 'update') notesToUpdate.push(plan.data);
    }
    
    showProgress(i + 1, records.length);
  }

  return { notesToAdd, notesToUpdate };
}

/**
 * Logic to process a single CSV record.
 */
function processRecord(word, row, config, existing) {
  const fields = buildNoteFields(row, config.mapping);
  const audioPlan = getAudioSyncPlan(config, fields, existing);
  const allFields = { ...fields, ...audioPlan.fields };

  // Case: New note
  if (!existing) {
    return {
      type: 'add',
      data: {
        deckName: config.anki_deck,
        modelName: config.anki_model,
        word,
        fields: allFields,
        audio: audioPlan.downloads,
        options: { allowDuplicate: false },
        tags: ["csv-sync"],
      }
    };
  }

  // Case: Update existing note (only if force_sync is on)
  if (config.force_sync) {
    const changes = getFieldChanges(allFields, existing);
    if (changes) {
      // Surgical update: only send fields that actually changed
      const fieldsToUpdate = Object.keys(changes).reduce((acc, f) => {
        acc[f] = allFields[f];
        return acc;
      }, {});

      return {
        type: 'update',
        data: {
          id: existing.noteId,
          word,
          fields: fieldsToUpdate,
          fieldChanges: changes,
          audio: audioPlan.downloads.length > 0 ? audioPlan.downloads : undefined
        }
      };
    }
  }

  return null;
}

module.exports = { buildSyncPlan };
