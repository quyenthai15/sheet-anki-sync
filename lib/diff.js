/**
 * Maps a CSV row to Anki fields using the config mapping.
 */
function buildNoteFields(row, mapping) {
  const fields = {};
  for (const [sheetCol, ankiField] of Object.entries(mapping)) {
    // Normalize to NFC for consistent Japanese character handling
    fields[ankiField] = (row[sheetCol] || "").trim().normalize('NFC');
  }
  return fields;
}

/**
 * Returns an object with the changed fields (old and new values) or null if no changes.
 */
function getFieldChanges(fields, existingNote) {
  const changes = {};
  let hasChanges = false;
  for (const [ankiField, newValue] of Object.entries(fields)) {
    // Both sides are already normalized
    if (existingNote.fields[ankiField] !== newValue) {
      changes[ankiField] = {
        old: existingNote.fields[ankiField],
        new: newValue
      };
      hasChanges = true;
    }
  }
  return hasChanges ? changes : null;
}

/**
 * Returns true if any mapped field value differs from the existing note.
 * (Keeping for backward compatibility)
 */
function hasFieldChanges(fields, existingNote) {
  return !!getFieldChanges(fields, existingNote);
}

module.exports = { buildNoteFields, hasFieldChanges, getFieldChanges };
