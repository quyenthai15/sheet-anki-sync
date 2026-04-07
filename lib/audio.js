function getTtsUrl(text, lang = 'ja') {
  return `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(text)}`;
}

/**
 * Builds the audio entries array for a note.
 * Returns an empty array if no audio needs to be generated.
 */
function buildAudioEntries(config, fields, firstAnkiField, existingNote) {
  const audio = [];

  const hasExistingAudio =
    existingNote &&
    existingNote.fields[config.audio_field] &&
    existingNote.fields[config.audio_field].includes('[sound:');

  const sentenceSourceCol = config.sentence_source_col || "JP sentence";
  const japaneseSentence = fields[config.mapping[sentenceSourceCol]];

  const hasExistingSentenceAudio =
    existingNote &&
    config.sentence_audio_field &&
    existingNote.fields[config.sentence_audio_field] &&
    existingNote.fields[config.sentence_audio_field].includes("[sound:");

  // Primary word audio
  if (config.audio_field && (!existingNote || !hasExistingAudio) && fields[firstAnkiField]) {
    const safeFilename = `ja_tts_${fields[firstAnkiField].replace(/[\/\\?%*:|"<>]/g, "_")}.mp3`;
    audio.push({
      url: getTtsUrl(fields[firstAnkiField]),
      filename: safeFilename,
      fields: [config.audio_field],
    });
  }

  // Sentence audio
  if (config.sentence_audio_field && japaneseSentence && (!existingNote || !hasExistingSentenceAudio)) {
    const safeFilename = `ja_sentence_tts_${japaneseSentence.substring(0, 50).replace(/[\/\\?%*:|"<>]/g, "_")}.mp3`;
    audio.push({
      url: getTtsUrl(japaneseSentence),
      filename: safeFilename,
      fields: [config.sentence_audio_field],
    });
  }

  return audio;
}

module.exports = { getTtsUrl, buildAudioEntries };
