/**
 * CONFIGURATION: Adjust these to match your Google Sheet layout.
 * Columns are 1-indexed (A=1, B=2, C=3, etc.)
 */
const CONFIG = {
  SOURCE_EXPRESSION_COL: 1, // Column A: The word you want to look up
  SOURCE_MEANING_COL: 2, // Column B: Optional meaning/context
  MASTER_SHEET_NAME: "master_list",
  CHUNK_SIZE: 20, // Number of words to process in one API call

  // Mapping of result keys to column numbers (where the AI writes back)
  RESULTS_MAPPING: {
    reading: 3, // Column C
    kanji: 4, // Column D
    type: 5, // Column E
    sentence_jp: 6, // Column F
    sentence_vn: 7, // Column G
    level: 8, // Column H
  },
};

const GEMINI_API_KEY =
  PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
const MODEL_NAME = "gemini-2.5-flash";

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("J-Study Tools")
    .addItem("Generate Data for Selected Rows", "fillVocabData")
    .addSeparator()
    .addItem("Add New Row at Top", "addRowTop")
    .addItem("Move New Words to Master", "moveToMaster")
    .addToUi();
}

/**
 * Inserts a new row at row 1 (just below the headers).
 */
function addRowTop() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.insertRowBefore(1);
}

/**
 * Validates API Key.
 */
function validateSetup() {
  if (!GEMINI_API_KEY) {
    SpreadsheetApp.getUi().alert(
      "MISSING API KEY:\n\n1. Go to Project Settings (gear icon).\n2. Add a Script Property named 'GEMINI_API_KEY'.\n3. Get a free key at: https://aistudio.google.com/app/apikey",
    );
    return false;
  }
  return true;
}

/**
 * Processes all selected rows in batches (chunks).
 */
function fillVocabData() {
  if (!validateSetup()) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const rangeList = sheet.getActiveRangeList();
  if (!rangeList) return;
  const ranges = rangeList.getRanges();

  // 1. Read all selected rows in one Sheets call via bounding range
  const minRow = Math.min(...ranges.map((r) => r.getRow()));
  const maxRow = Math.max(
    ...ranges.map((r) => r.getRow() + r.getNumRows() - 1),
  );
  const boundingData = sheet
    .getRange(minRow, 1, maxRow - minRow + 1, 2)
    .getValues();

  const selectedRows = new Set(
    ranges.flatMap((r) =>
      Array.from({ length: r.getNumRows() }, (_, i) => r.getRow() + i),
    ),
  );

  const wordsToProcess = [];
  for (let row = minRow; row <= maxRow; row++) {
    if (!selectedRows.has(row)) continue;
    const [expression, meaning] = boundingData[row - minRow];
    if (
      !expression ||
      expression.toString().toLowerCase().includes("expression")
    )
      continue;
    wordsToProcess.push({
      expression: expression.toString().trim(),
      meaning: meaning.toString().trim(),
      row,
    });
  }

  if (wordsToProcess.length === 0) {
    ss.toast("No valid words selected.");
    return;
  }

  // 2. Get known vocab for context — read only populated rows
  const masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET_NAME);
  const knownVocab = masterSheet
    ? masterSheet
        .getRange(1, 1, masterSheet.getLastRow(), 1)
        .getValues()
        .flat()
        .filter(String)
        .join(", ")
    : "";

  // 3. Process in chunks
  for (let i = 0; i < wordsToProcess.length; i += CONFIG.CHUNK_SIZE) {
    const chunk = wordsToProcess.slice(i, i + CONFIG.CHUNK_SIZE);
    processBatch(sheet, chunk, knownVocab);
    const progress = Math.min(i + CONFIG.CHUNK_SIZE, wordsToProcess.length);
    ss.toast(`Processed ${progress} of ${wordsToProcess.length} words...`);
  }

  ss.toast(`Done — ${wordsToProcess.length} words processed.`, "✓", 5);
}

/**
 * Sends a batch of words to Gemini and writes back results.
 */
function processBatch(sheet, chunk, knownVocab) {
  const prompt = `
Act as a Senior Japanese Language Instructor specializing in beginners (JLPT N5).
Generate linguistic data for these words: ${JSON.stringify(chunk.map((c, index) => ({ id: index, word: c.expression, context: c.meaning })))}

STRICT INSTRUCTIONS:
1. GRAMMAR: Use SIMPLE grammar suitable for N5 beginners. Avoid complex particles or nested clauses.
2. VOCABULARY: For example sentences, strictly prioritize using words from this known list: [${knownVocab}]. Avoid introducing new or advanced words unless absolutely necessary for the sentence to make sense.
3. UNKNOWN DATA: If Kanji or Word Type cannot be confidently determined, return null or an empty string. NEVER hallucinate information.
4. TENSE: Ensure the grammatical tense matches the context, but keep it simple (Past/Present/Future).
5. FORMAT: Provide Kanji (leave null if not available), Reading (Kana), Word Type (e.g. Noun, Verb-u), a simple sentence, and its Vietnamese translation. Note only the sentence translation should be in Vietnamese.
6. PITCH ACCENT: Use standard Tokyo dialect. Provide the Pitch Accent Type as a number in brackets appended to the "reading" field.
   - The number MUST be ≥ 0 and ≤ the mora count of the reading. NEVER output a number higher than the word's mora count (e.g. a 3-mora word たまご can only be [0], [1], [2], or [3]).
   - [0] = Heiban (Flat): だいがく [0]
   - [1] = Atamadaka (Head-high): あめ [1]
   - [2], [3]... = Nakadaka/Odaka (Middle/Tail-high): たまご [2], はし [2]
   - UNKNOWN: If the pitch accent is unknown or uncertain, provide the reading with NO brackets.
   Include this number directly in the "reading" field.

Return ONLY a JSON array of objects following this exact schema:
[
  {
    "id": 0,
    "input_word": "original word",
    "kanji": "Kanji or null",
    "reading": "Kana reading with pitch type, e.g. あめ [1], だいがく [0]",
    "type": "Word type or null",
    "sentence_jp": "Simple N5 sentence",
    "sentence_vn": "Vietnamese translation",
    "level": "N5"
  }
]
`;

  try {
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    };
    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`,
      options,
    );

    const jsonResponse = JSON.parse(response.getContentText());
    if (!jsonResponse.candidates || !jsonResponse.candidates[0]) {
      throw new Error(
        jsonResponse.error
          ? jsonResponse.error.message
          : "AI returned no result",
      );
    }

    const results = JSON.parse(
      jsonResponse.candidates[0].content.parts[0].text,
    );
    if (!Array.isArray(results)) {
      throw new Error(
        "AI did not return an array. Response: " + JSON.stringify(results),
      );
    }

    const mappingEntries = Object.entries(CONFIG.RESULTS_MAPPING);
    const minCol = Math.min(...mappingEntries.map(([, c]) => c));
    const maxCol = Math.max(...mappingEntries.map(([, c]) => c));
    const numCols = maxCol - minCol + 1;

    // Build sorted (row, rowData) pairs
    const writes = results
      .map((res) => {
        const originalEntry = chunk[res.id];
        if (!originalEntry) return null;
        const rowData = Array(numCols).fill("");
        for (const [key, col] of mappingEntries) {
          if (res[key] != null) rowData[col - minCol] = res[key];
        }
        return { row: originalEntry.row, rowData };
      })
      .filter(Boolean)
      .sort((a, b) => a.row - b.row);

    // Flush contiguous blocks in one setValues call each
    let i = 0;
    while (i < writes.length) {
      let j = i + 1;
      while (j < writes.length && writes[j].row === writes[j - 1].row + 1) j++;
      const block = writes.slice(i, j);
      sheet
        .getRange(block[0].row, minCol, block.length, numCols)
        .setValues(block.map((w) => w.rowData));
      i = j;
    }
  } catch (e) {
    throw new Error(`Batch processing failed: ${e.message}`);
  }
}

/**
 * Copies unique words from the current sheet to master_list.
 * Automatically creates the master_list sheet if it doesn't exist.
 */
function moveToMaster() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getActiveSheet();
  let masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET_NAME);

  // Auto-create master sheet if missing
  if (!masterSheet) {
    masterSheet = ss.insertSheet(CONFIG.MASTER_SHEET_NAME);
    const headers = sourceSheet
      .getRange(1, 1, 1, sourceSheet.getLastColumn())
      .getValues();
    masterSheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
    ss.toast(`Created missing '${CONFIG.MASTER_SHEET_NAME}' sheet.`);
  }

  if (sourceSheet.getName() === CONFIG.MASTER_SHEET_NAME) {
    ss.toast("You are already on the Master List sheet.");
    return;
  }

  const sourceData = sourceSheet.getDataRange().getValues();
  const masterData = masterSheet.getDataRange().getValues();

  const existingWords = new Set(
    masterData.map((row) => row[0].toString().trim().toLowerCase()),
  );

  const newRows = [];
  for (let i = 1; i < sourceData.length; i++) {
    const word = sourceData[i][0].toString().trim();
    if (word && !existingWords.has(word.toLowerCase())) newRows.push([word]);
  }

  if (newRows.length > 0) {
    masterSheet
      .getRange(masterSheet.getLastRow() + 1, 1, newRows.length, 1)
      .setValues(newRows);
    ss.toast(`Added ${newRows.length} new words to Master List.`, "✓", 5);
  } else {
    ss.toast("No new words found to add.");
  }
}
