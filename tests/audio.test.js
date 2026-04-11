const { getAudioSyncPlan } = require("../lib/audio");

describe("lib/audio", () => {
  const config = {
    audio_field: "Audio",
    sentence_audio_field: "SentenceAudio",
    sentence_source_col: "JP sentence",
    mapping: {
      Word: "Expression",
      "JP sentence": "Sentence",
    },
  };

  const fields = {
    Expression: "食べる",
    Sentence: "リンゴを食べる。",
  };

  describe("getAudioSyncPlan", () => {
    test("suggests audio for new notes", () => {
      const plan = getAudioSyncPlan(config, fields, null);
      expect(plan.downloads).toHaveLength(2);
      expect(plan.fields).toEqual({
        Audio: expect.stringContaining("[sound:ja_tts_"),
        SentenceAudio: expect.stringContaining("[sound:ja_sentence_tts_"),
      });
    });

    test("skips audio if already exists and sentence unchanged", () => {
      const existing = {
        fields: {
          Audio: "[sound:old_word.mp3]",
          SentenceAudio: "[sound:old_sentence.mp3]",
          Sentence: "リンゴを食べる。",
        },
      };
      const plan = getAudioSyncPlan(config, fields, existing);
      expect(plan.downloads).toBeUndefined();
      expect(plan.fields).toEqual({});
    });

    test("regenerates sentence audio if sentence text changed", () => {
      const existing = {
        fields: {
          Audio: "[sound:old_word.mp3]",
          SentenceAudio: "[sound:old_sentence.mp3]",
          Sentence: "古い文章",
        },
      };
      const plan = getAudioSyncPlan(config, fields, existing);
      expect(plan.downloads).toHaveLength(1);
      expect(plan.downloads[0].field).toBe("SentenceAudio");
      expect(plan.fields).toHaveProperty("SentenceAudio");
      expect(plan.fields).not.toHaveProperty("Audio");
    });

    test("does not regenerate word audio even if sentence changed", () => {
      const existing = {
        fields: {
          Audio: "[sound:old_word.mp3]",
          SentenceAudio: "[sound:old_sentence.mp3]",
          Sentence: "古い文章",
        },
      };
      const plan = getAudioSyncPlan(config, fields, existing);
      expect(plan.fields).not.toHaveProperty("Audio");
    });
  });
});
