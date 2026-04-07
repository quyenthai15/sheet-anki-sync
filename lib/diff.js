/**
 * Maps a CSV row to Anki fields using the config mapping.
 */
function buildNoteFields(row, mapping) {
  const fields = {};
  for (const [sheetCol, ankiField] of Object.entries(mapping)) {
    fields[ankiField] = (row[sheetCol] || "").trim();
  }
  return fields;
}

/**
 * Returns true if any mapped field value differs from the existing note.
 */
function hasFieldChanges(fields, existingNote) {
  for (const [ankiField, newValue] of Object.entries(fields)) {
    if (existingNote.fields[ankiField] !== newValue) return true;
  }
  return false;
}

module.exports = { buildNoteFields, hasFieldChanges };
