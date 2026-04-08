function getTtsUrl(text, lang = 'ja') {
  return `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(text.normalize('NFC'))}`;
}

/**
 * Helper to create a safe filename for Anki media.
 * Removes forbidden characters and ensures NFC normalization.
 */
function sanitizeFilename(name, prefix) {
  const normalized = name.normalize('NFC');
  // Replaces characters forbidden by major OSs and Anki's media storage requirements
  // Also limits filename length to prevent filesystem errors
  const safe = normalized.replace(/[\/\\?%*:|"<>\[\]]/g, "_").substring(0, 50);
  return `${prefix}_${safe}.mp3`;
}

/**
 * Builds the audio entries array for a note.
 * Returns an empty array if no audio needs to be generated.
 */
function buildAudioEntries(config, fields, firstAnkiField, existingNote) {
  const audio = [];

  const audioField = config.audio_field;
  const sentenceAudioField = config.sentence_audio_field;
  const sentenceSourceCol = config.sentence_source_col || "JP sentence";
  const sentenceAnkiField = config.mapping[sentenceSourceCol];

  const hasExistingAudio =
    existingNote &&
    audioField &&
    existingNote.fields[audioField] &&
    existingNote.fields[audioField].includes('[sound:');

  const japaneseSentence = fields[sentenceAnkiField];

  const hasExistingSentenceAudio =
    existingNote &&
    sentenceAudioField &&
    existingNote.fields[sentenceAudioField] &&
    existingNote.fields[sentenceAudioField].includes("[sound:");

  // Check if the sentence content itself has changed
  const sentenceChanged = 
    existingNote && 
    japaneseSentence && 
    existingNote.fields[sentenceAnkiField] !== japaneseSentence;

  // Primary word audio: Only if missing (Audio Protection mandate)
  if (audioField && (!existingNote || !hasExistingAudio) && fields[firstAnkiField]) {
    const filename = sanitizeFilename(fields[firstAnkiField], 'ja_tts');
    audio.push({
      url: getTtsUrl(fields[firstAnkiField]),
      filename: filename,
      fields: [audioField],
    });
  }

  // Sentence audio: If missing OR if the sentence text changed
  if (sentenceAudioField && japaneseSentence && (!existingNote || !hasExistingSentenceAudio || sentenceChanged)) {
    const filename = sanitizeFilename(japaneseSentence, 'ja_sentence_tts');
    audio.push({
      url: getTtsUrl(japaneseSentence),
      filename: filename,
      fields: [sentenceAudioField],
    });
  }

  return audio;
}

module.exports = { getTtsUrl, buildAudioEntries };
