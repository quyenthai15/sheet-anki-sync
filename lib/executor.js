const { ankiAction } = require("./anki");
const { showProgress } = require("./progress");

const WRITE_CHUNK_SIZE = 100;

/**
 * Execute updates in chunks: store media, update fields.
 * @param {array} notesToUpdate - Notes to update
 */
async function executeUpdates(notesToUpdate) {
  if (notesToUpdate.length === 0) return;

  console.log(`Updating ${notesToUpdate.length} cards...`);
  let updatedCount = 0;
  showProgress(0, notesToUpdate.length);

  for (let i = 0; i < notesToUpdate.length; i += WRITE_CHUNK_SIZE) {
    const rawChunk = notesToUpdate.slice(i, i + WRITE_CHUNK_SIZE);
    const actions = [];

    rawChunk.forEach((n) => {
      // 1. Add storeMediaFile actions if needed
      if (n.audio) {
        n.audio.forEach((a) => {
          actions.push({
            action: "storeMediaFile",
            params: { filename: a.filename, url: a.url },
          });
        });
      }
      // 2. Add updateNoteFields action
      actions.push({
        action: "updateNoteFields",
        params: {
          note: { id: n.id, fields: n.fields },
        },
      });
    });

    const multiResult = await ankiAction("multi", { actions });
    if (!multiResult.success) {
      console.error(
        `\n\x1b[41m\x1b[37m ERROR \x1b[0m Failed to execute update batch starting at index ${i}: ${multiResult.error}`,
      );
    } else {
      // Anki multi action returns an array.
      // updateNoteFields returns null on success.
      // storeMediaFile returns the filename on success.
      const results = multiResult.data;
      results.forEach((res, resIdx) => {
        const action = actions[resIdx].action;
        let isError = false;

        if (action === "updateNoteFields" && res !== null) {
          isError = true;
        } else if (action === "storeMediaFile" && !res) {
          isError = true;
        }

        if (isError) {
          console.error(
            `\n\x1b[33m[Batch Warning]\x1b[0m Action "${action}" failed: ${JSON.stringify(res)}`,
          );
        }
      });
      updatedCount += rawChunk.length;
    }
    showProgress(updatedCount, notesToUpdate.length);
  }
  console.log(`\nUpdate complete. ${updatedCount} notes updated.`);
}

/**
 * Execute additions in chunks: validate, then add notes.
 * @param {array} notesToAdd - Notes to add
 */
async function executeAdditions(notesToAdd) {
  if (notesToAdd.length === 0) return;

  console.log(`Adding ${notesToAdd.length} new notes...`);

  let successfulAdds = 0;
  let failedAdds = 0;
  showProgress(0, notesToAdd.length);

  for (let i = 0; i < notesToAdd.length; i += WRITE_CHUNK_SIZE) {
    const chunk = notesToAdd.slice(i, i + WRITE_CHUNK_SIZE);

    const canAddResult = await ankiAction("canAddNotesWithErrorDetail", {
      notes: chunk,
    });
    const errorMap = new Map();
    if (canAddResult.success) {
      canAddResult.data.forEach((res, index) => {
        if (!res.canAdd) errorMap.set(index, res.error);
      });
    }

    const addNotesResult = await ankiAction("addNotes", { notes: chunk });
    if (!addNotesResult.success) {
      console.error(
        `\n\x1b[41m\x1b[37m BATCH FAILED \x1b[0m Batch addNotes operation failed at index ${i}: ${addNotesResult.error}`,
      );
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
          const reason =
            errorMap.get(index) ||
            "Unknown reason (likely duplicate or missing field)";
          console.error(
            `\n\x1b[31m[FAILED]\x1b[0m Note for "${chunk[index].word}": ${reason}`,
          );
        }
      });
    }
    showProgress(successfulAdds + failedAdds, notesToAdd.length);
  }
  console.log(
    `\nAdditions complete. Success: ${successfulAdds}, Failed: ${failedAdds}`,
  );
}

module.exports = { executeUpdates, executeAdditions };
