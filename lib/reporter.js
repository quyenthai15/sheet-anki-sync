const { ankiAction } = require('./anki');

/**
 * Print dry-run summary and optionally validate additions.
 * @param {array} notesToAdd - Notes to be added
 /**
  * Print a summary of changes to the console.
  */
 async function printDryRunSummary(notesToAdd, notesToUpdate) {
   console.log(`\n\x1b[1mDRY RUN SUMMARY:\x1b[0m`);
   console.log(`- New cards to add: \x1b[32m${notesToAdd.length}\x1b[0m`);
   console.log(`- Cards with changes to update: \x1b[33m${notesToUpdate.length}\x1b[0m`);

   if (notesToUpdate.length > 0) {
     console.log("\n\x1b[1mDETAILED CHANGES (UPDATES):\x1b[0m");
     notesToUpdate.forEach(u => {
       console.log(`\x1b[33m[Update]\x1b[0m "${u.word}":`);
       if (u.fieldChanges) {
         Object.entries(u.fieldChanges).forEach(([field, val]) => {
           console.log(`  - ${field}: "${val.old}" -> "${val.new}"`);
         });
       }
       if (u.needsAudio) console.log("  - \x1b[34mAdding Word Audio\x1b[0m");
       if (u.needsSentenceAudio) console.log("  - \x1b[34mAdding Sentence Audio\x1b[0m");
     });
   }

   if (notesToAdd.length > 0) {
     console.log("\n\x1b[1mDETAILED CHANGES (ADDITIONS):\x1b[0m");
     notesToAdd.forEach(n => {
       console.log(`\x1b[32m[Add]\x1b[0m "${n.word}"`);
     });

     console.log("\nValidating additions (first 500)...");
     const checkChunk = notesToAdd.slice(0, 500);
     const canAddResult = await ankiAction("canAddNotesWithErrorDetail", { notes: checkChunk });
     if (canAddResult.success) {
       canAddResult.data.forEach((res, index) => {
         if (!res.canAdd) {
           console.warn(`  \x1b[31m[Warning]\x1b[0m "${notesToAdd[index].word}" would fail: ${res.error}`);
         }
       });
     }
   }

   console.log("\n\x1b[1mNo changes were made to Anki.\x1b[0m");
 }
module.exports = { printDryRunSummary };
