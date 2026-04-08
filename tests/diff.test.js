const { buildNoteFields, hasFieldChanges, getFieldChanges } = require('../lib/diff');

describe('lib/diff', () => {
  const mapping = {
    'Sheet Word': 'Expression',
    'Sheet Reading': 'Reading',
    'Sheet Meaning': 'Meaning'
  };

  const row = {
    'Sheet Word': '食べる',
    'Sheet Reading': 'たべる',
    'Sheet Meaning': 'to eat'
  };

  describe('buildNoteFields', () => {
    test('correctly maps CSV row to Anki fields', () => {
      const fields = buildNoteFields(row, mapping);
      expect(fields).toEqual({
        Expression: '食べる',
        Reading: 'たべる',
        Meaning: 'to eat'
      });
    });

    test('normalizes values to NFC', () => {
      // Using a character that can be represented in different forms
      const input = "か\u3099"; // か + combining dakuten
      const rowWithNFD = { 'Sheet Word': input };
      const fields = buildNoteFields(rowWithNFD, { 'Sheet Word': 'Expression' });
      expect(fields.Expression).toBe("が"); // Normalized to NFC
      expect(fields.Expression.length).toBe(1);
    });
  });

  describe('getFieldChanges', () => {
    const fields = {
      Expression: '食べる',
      Reading: 'たべる',
      Meaning: 'to eat'
    };

    test('returns null when there are no changes', () => {
      const existingNote = {
        fields: {
          Expression: '食べる',
          Reading: 'たべる',
          Meaning: 'to eat'
        }
      };
      expect(getFieldChanges(fields, existingNote)).toBeNull();
    });

    test('returns object with changes when fields differ', () => {
      const existingNote = {
        fields: {
          Expression: '食べる',
          Reading: 'たべます', // Changed
          Meaning: 'to consume' // Changed
        }
      };
      const changes = getFieldChanges(fields, existingNote);
      expect(changes).toEqual({
        Reading: { old: 'たべます', new: 'たべる' },
        Meaning: { old: 'to consume', new: 'to eat' }
      });
    });
  });

  describe('hasFieldChanges', () => {
    const fields = { Expression: '食べる' };

    test('returns true when there are changes', () => {
      const existingNote = { fields: { Expression: 'たべる' } };
      expect(hasFieldChanges(fields, existingNote)).toBe(true);
    });

    test('returns false when there are no changes', () => {
      const existingNote = { fields: { Expression: '食べる' } };
      expect(hasFieldChanges(fields, existingNote)).toBe(false);
    });
  });
});
