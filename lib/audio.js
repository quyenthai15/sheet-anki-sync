function getTtsUrl(text, lang = 'ja') {
  const cleanText = text.replace(/\[\d+\]/g, "");
  return `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(cleanText.normalize('NFC'))}`;
}

/**
 * Helper to create a safe filename for Anki media.
 */
function sanitizeFilename(name, prefix) {
  const normalized = name.normalize('NFC');
  const safe = normalized.replace(/[\/\\?%*:|"<>\[\]]/g, "_").substring(0, 50);
  return `${prefix}_${safe}.mp3`;
}

const hasSound = (val) => val?.includes('[sound:');

/**
 * Builds a structured audio sync plan.
 * Only suggests regeneration if missing or (for sentences) if text changed.
 */
function getAudioSyncPlan(config, fields, existingNote) {
  const {
    audio_field: wordAudField,
    sentence_audio_field: sentenceAudField,
    mapping,
    sentence_source_col: sc = "JP sentence",
  } = config;

  const word = fields[mapping[Object.keys(mapping)[0]]];
  const sentence = fields[mapping[sc]];
  const plan = { downloads: [], fields: {} };

  // Word audio: Only if missing
  if (wordAudField && word && !hasSound(existingNote?.fields[wordAudField])) {
    const filename = sanitizeFilename(word, "ja_tts");
    plan.downloads.push({
      url: getTtsUrl(word),
      filename,
      field: wordAudField,
    });
    plan.fields[wordAudField] = `[sound:${filename}]`;
  }

  // Sentence audio: If missing OR if sentence text changed
  const oldSentence = existingNote?.fields[mapping[sc]];
  const sentenceChanged = oldSentence && oldSentence !== sentence;

  if (
    sentenceAudField &&
    sentence &&
    (!hasSound(existingNote?.fields[sentenceAudField]) || sentenceChanged)
  ) {
    const filename = sanitizeFilename(sentence, "ja_sentence_tts");
    plan.downloads.push({
      url: getTtsUrl(sentence),
      filename,
      field: sentenceAudField,
    });
    plan.fields[sentenceAudField] = `[sound:${filename}]`;
  }

  return {
    ...plan,
    downloads: plan.downloads.length > 0 ? plan.downloads : undefined,
  };
}

module.exports = { getTtsUrl, getAudioSyncPlan };
