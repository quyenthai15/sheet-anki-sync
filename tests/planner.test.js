const { buildSyncPlan } = require('../lib/planner');

jest.mock('../lib/progress', () => ({
  showProgress: jest.fn()
}));

describe('lib/planner', () => {
  const config = {
    audio_field: 'Audio',
    sentence_audio_field: 'SentenceAudio',
    sentence_source_col: 'JP sentence',
    anki_deck: 'Deck',
    anki_model: 'Model',
    force_sync: true,
    mapping: {
      'Word': 'Expression',
      'JP sentence': 'Sentence'
    }
  };

  const records = [
    { Word: '食べる', 'JP sentence': 'リンゴを食べる。' }
  ];

  const ankiDataMap = new Map();

  test('builds "add" plan for new note', async () => {
    const plan = await buildSyncPlan(records, config, ankiDataMap);
    expect(plan.notesToAdd).toHaveLength(1);
    expect(plan.notesToAdd[0].fields).toHaveProperty('Audio');
    expect(plan.notesToAdd[0].fields).toHaveProperty('SentenceAudio');
    expect(plan.notesToAdd[0].fields.Audio).toContain('[sound:');
  });

  test('builds "update" plan with surgical fields', async () => {
    ankiDataMap.set('食べる', {
      noteId: 123,
      fields: {
        Expression: '食べる',
        Sentence: '古い文章',
        Audio: '[sound:word.mp3]',
        SentenceAudio: '[sound:sentence.mp3]'
      }
    });

    const plan = await buildSyncPlan(records, config, ankiDataMap);
    expect(plan.notesToUpdate).toHaveLength(1);
    
    const updatedFields = plan.notesToUpdate[0].fields;
    // Sentence changed, so Sentence and SentenceAudio should be in updatedFields
    expect(updatedFields).toHaveProperty('Sentence', 'リンゴを食べる。');
    expect(updatedFields).toHaveProperty('SentenceAudio');
    
    // Word and WordAudio did NOT change, so they should NOT be in updatedFields
    expect(updatedFields).not.toHaveProperty('Expression');
    expect(updatedFields).not.toHaveProperty('Audio');
  });

  test('skips update if nothing changed', async () => {
    ankiDataMap.set('食べる', {
      noteId: 123,
      fields: {
        Expression: '食べる',
        Sentence: 'リンゴを食べる。',
        Audio: '[sound:word.mp3]',
        SentenceAudio: '[sound:sentence.mp3]'
      }
    });

    // We need to simulate the sound filename matching to avoid regeneration
    // In our simplified test, we'll just check if it skips
    const plan = await buildSyncPlan(records, config, ankiDataMap);
    expect(plan.notesToUpdate).toHaveLength(0);
  });
});
