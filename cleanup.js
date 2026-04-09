/**
 * Cleanup script: clears SentenceAudio fields on notes where the audio filename
 * no longer matches the current sentence text (i.e. the sentence was updated
 * but audio was not regenerated). Run `npm run sync:force` afterwards to
 * regenerate the correct audio.
 */
const { loadConfig } = require("./lib/config");
const { ankiAction } = require("./lib/anki");

function sanitizeFilename(name, prefix) {
  const normalized = name.normalize("NFC");
  const safe = normalized.replace(/[\/\\?%*:|"<>\[\]]/g, "_").substring(0, 50);
  return `${prefix}_${safe}.mp3`;
}

async function run() {
  const config = loadConfig();
  const sentenceAudioField = config.sentence_audio_field;
  const sentenceSourceCol = config.sentence_source_col || "JP sentence";
  const sentenceAnkiField = config.mapping[sentenceSourceCol];

  if (!sentenceAudioField || !sentenceAnkiField) {
    console.error(
      "Config is missing sentence_audio_field or sentence mapping. Aborting.",
    );
    process.exit(1);
  }

  console.log(`Fetching notes from deck "${config.anki_deck}"...`);
  const findResult = await ankiAction("findNotes", {
    query: `deck:"${config.anki_deck}"`,
  });
  if (!findResult.success) {
    console.error(`Failed to find notes: ${findResult.error}`);
    process.exit(1);
  }

  const noteIds = findResult.data;
  console.log(
    `Found ${noteIds.length} notes. Checking for stale sentence audio...`,
  );

  const staleNoteIds = [];
  const chunkSize = 500;

  for (let i = 0; i < noteIds.length; i += chunkSize) {
    const chunk = noteIds.slice(i, i + chunkSize);
    const infoResult = await ankiAction("notesInfo", { notes: chunk });
    if (!infoResult.success) {
      console.error(`Failed to fetch note info: ${infoResult.error}`);
      process.exit(1);
    }

    infoResult.data.forEach((note) => {
      const sentenceAudio = note.fields[sentenceAudioField]?.value || "";
      const sentenceText = (note.fields[sentenceAnkiField]?.value || "")
        .trim()
        .normalize("NFC");

      if (!sentenceAudio.includes("[sound:") || !sentenceText) return;

      const soundTags = sentenceAudio.match(/\[sound:[^\]]+\]/g) || [];
      const expectedFilename = sanitizeFilename(sentenceText, "ja_sentence_tts");
      const hasExpected = sentenceAudio.includes(`[sound:${expectedFilename}]`);

      // Stale if: expected filename is missing (sentence drifted),
      // OR there are multiple [sound:] tags (duplicate from previous hash-rename bug)
      if (!hasExpected || soundTags.length > 1) {
        staleNoteIds.push(note.noteId);
        console.log(
          `  [stale] tags: ${soundTags.join(" ")} | expected: [sound:${expectedFilename}]`,
        );
      }
    });
  }

  if (staleNoteIds.length === 0) {
    console.log("No stale sentence audio found. Nothing to clean up.");
    return;
  }

  console.log(
    `Found ${staleNoteIds.length} notes with stale sentence audio. Clearing...`,
  );

  const WRITE_CHUNK_SIZE = 100;
  let cleared = 0;

  for (let i = 0; i < staleNoteIds.length; i += WRITE_CHUNK_SIZE) {
    const chunk = staleNoteIds.slice(i, i + WRITE_CHUNK_SIZE);
    const actions = chunk.map((id) => ({
      action: "updateNoteFields",
      params: { note: { id, fields: { [sentenceAudioField]: "" } } },
    }));

    const result = await ankiAction("multi", { actions });
    if (!result.success) {
      console.error(`Batch update failed at index ${i}: ${result.error}`);
    } else {
      cleared += chunk.length;
    }
  }

  console.log(`Done. Cleared SentenceAudio on ${cleared} notes.`);
  console.log(`Run "npm run sync:force" to regenerate audio for these notes.`);
}

run().catch((e) => {
  console.error("Unexpected error:", e.message);
  process.exit(1);
});
