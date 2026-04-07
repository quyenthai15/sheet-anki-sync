const axios = require('axios');
const { ankiAction, getAnkiDataMap } = require('../lib/anki');
const { validateSetup } = require('../lib/validate');

jest.mock('axios');

beforeEach(() => {
  axios.post.mockClear();
});

// Helper to mock a successful AnkiConnect response
function mockAnkiSuccess(result) {
  axios.post.mockResolvedValueOnce({ data: { result, error: null } });
}

// Helper to mock an AnkiConnect-level error (HTTP 200, but error field set)
function mockAnkiError(message) {
  axios.post.mockResolvedValueOnce({ data: { result: null, error: message } });
}

// Helper to mock a network-level error
function mockNetworkError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  axios.post.mockRejectedValueOnce(err);
}

// ─── ankiAction ──────────────────────────────────────────────────────────────

describe('ankiAction', () => {
  test('returns success with data on valid response', async () => {
    mockAnkiSuccess(['Default', 'Japanese::N5']);
    const result = await ankiAction('deckNames');
    expect(result).toEqual({ success: true, data: ['Default', 'Japanese::N5'], error: null });
  });

  test('returns failure when AnkiConnect returns an error field', async () => {
    mockAnkiError('collection is not available');
    const result = await ankiAction('deckNames');
    expect(result).toEqual({ success: false, error: 'collection is not available', data: null });
  });

  test('returns friendly message on ECONNREFUSED', async () => {
    mockNetworkError('ECONNREFUSED');
    const result = await ankiAction('deckNames');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Anki is not running/);
  });

  test('returns error message on unknown network error', async () => {
    mockNetworkError('ETIMEDOUT', 'socket hang up');
    const result = await ankiAction('deckNames');
    expect(result.success).toBe(false);
    expect(result.error).toBe('socket hang up');
  });
});

// ─── addNotes response shape ──────────────────────────────────────────────────

describe('ankiAction - addNotes response shape', () => {
  test('null entries in result indicate failed additions', async () => {
    // AnkiConnect returns an array: non-null = added noteId, null = failed
    mockAnkiSuccess([1234567890, null, 9876543210]);
    const result = await ankiAction('addNotes', { notes: [] });
    expect(result.success).toBe(true);
    const results = result.data;
    expect(results[0]).not.toBeNull();  // success
    expect(results[1]).toBeNull();      // failure
    expect(results[2]).not.toBeNull();  // success
  });
});

// ─── canAddNotesWithErrorDetail response shape ────────────────────────────────

describe('ankiAction - canAddNotesWithErrorDetail response shape', () => {
  test('returns canAdd true/false with error reason per note', async () => {
    mockAnkiSuccess([
      { canAdd: true, error: null },
      { canAdd: false, error: 'duplicate' },
    ]);
    const result = await ankiAction('canAddNotesWithErrorDetail', { notes: [] });
    expect(result.success).toBe(true);
    expect(result.data[0].canAdd).toBe(true);
    expect(result.data[1].canAdd).toBe(false);
    expect(result.data[1].error).toBe('duplicate');
  });
});

// ─── getAnkiDataMap ───────────────────────────────────────────────────────────

describe('getAnkiDataMap', () => {
  test('builds a map keyed by the primary field value', async () => {
    mockAnkiSuccess([101, 102]); // findNotes
    mockAnkiSuccess([           // notesInfo
      {
        noteId: 101,
        modelName: 'JP_sheet',
        fields: {
          Expression: { value: '食べる', order: 0 },
          Reading:    { value: 'たべる', order: 1 },
        },
      },
      {
        noteId: 102,
        modelName: 'JP_sheet',
        fields: {
          Expression: { value: '飲む', order: 0 },
          Reading:    { value: 'のむ',  order: 1 },
        },
      },
    ]);

    const map = await getAnkiDataMap('Japanese::N5', 'JP_sheet', 'Expression');
    expect(map.size).toBe(2);
    expect(map.get('食べる')).toEqual({
      noteId: 101,
      fields: { Expression: '食べる', Reading: 'たべる' },
    });
  });

  test('skips notes from a different model', async () => {
    mockAnkiSuccess([201]);
    mockAnkiSuccess([
      {
        noteId: 201,
        modelName: 'OtherModel',
        fields: { Expression: { value: '行く', order: 0 } },
      },
    ]);
    const map = await getAnkiDataMap('Japanese::N5', 'JP_sheet', 'Expression');
    expect(map.size).toBe(0);
  });

  test('calls notesInfo in chunks of 500', async () => {
    const ids = Array.from({ length: 550 }, (_, i) => i + 1);
    mockAnkiSuccess(ids); // findNotes returns 550 ids

    // First chunk (500 notes)
    mockAnkiSuccess(ids.slice(0, 500).map(id => ({
      noteId: id,
      modelName: 'JP_sheet',
      fields: { Expression: { value: `word${id}`, order: 0 } },
    })));
    // Second chunk (50 notes)
    mockAnkiSuccess(ids.slice(500).map(id => ({
      noteId: id,
      modelName: 'JP_sheet',
      fields: { Expression: { value: `word${id}`, order: 0 } },
    })));

    const map = await getAnkiDataMap('Japanese::N5', 'JP_sheet', 'Expression');
    // notesInfo should have been called twice (2 chunks)
    const notesInfoCalls = axios.post.mock.calls.filter(
      call => call[1].action === 'notesInfo'
    );
    expect(notesInfoCalls).toHaveLength(2);
    expect(map.size).toBe(550);
  });
});

// ─── validateSetup ────────────────────────────────────────────────────────────

describe('validateSetup', () => {
  const baseConfig = {
    anki_deck: 'Japanese::N5',
    anki_model: 'JP_sheet',
    mapping: { Expression: 'Expression', Reading: 'Reading' },
    audio_field: 'Audio',
    sentence_audio_field: null,
  };

  test('throws if a mapped sheet column is missing from CSV headers', async () => {
    const headers = ['Expression']; // missing 'Reading'
    await expect(validateSetup(baseConfig, headers)).rejects.toThrow('Reading');
  });

  test('creates the deck if it does not exist', async () => {
    const headers = ['Expression', 'Reading'];
    mockAnkiSuccess(['Default']);           // deckNames (no JP deck)
    mockAnkiSuccess(1);                    // createDeck
    mockAnkiSuccess(['JP_sheet']);          // modelNames
    mockAnkiSuccess(['Expression', 'Reading', 'Audio']); // modelFieldNames

    await expect(validateSetup(baseConfig, headers)).resolves.not.toThrow();

    const createDeckCall = axios.post.mock.calls.find(
      call => call[1].action === 'createDeck'
    );
    expect(createDeckCall).toBeDefined();
    expect(createDeckCall[1].params.deck).toBe('Japanese::N5');
  });

  test('throws if the Anki model does not exist', async () => {
    const headers = ['Expression', 'Reading'];
    mockAnkiSuccess(['Japanese::N5']); // deckNames
    mockAnkiSuccess(['OtherModel']);   // modelNames (JP_sheet missing)

    await expect(validateSetup(baseConfig, headers)).rejects.toThrow('JP_sheet');
  });

  test('throws if a mapped Anki field is missing from the model', async () => {
    const headers = ['Expression', 'Reading'];
    mockAnkiSuccess(['Japanese::N5']);               // deckNames
    mockAnkiSuccess(['JP_sheet']);                   // modelNames
    mockAnkiSuccess(['Expression']);                 // modelFieldNames — missing Reading and Audio

    await expect(validateSetup(baseConfig, headers)).rejects.toThrow(/field\(s\) not found/);
  });

  test('passes validation when everything is present', async () => {
    const headers = ['Expression', 'Reading'];
    mockAnkiSuccess(['Japanese::N5']);                        // deckNames
    mockAnkiSuccess(['JP_sheet']);                            // modelNames
    mockAnkiSuccess(['Expression', 'Reading', 'Audio']);      // modelFieldNames

    await expect(validateSetup(baseConfig, headers)).resolves.not.toThrow();
  });
});
