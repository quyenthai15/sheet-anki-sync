/**
 * CONFIGURATION: Adjust these to match your Google Sheet layout.
 * Columns are 1-indexed (A=1, B=2, C=3, etc.)
 */
const CONFIG = {
  SOURCE_EXPRESSION_COL: 1, // Column A: The word you want to look up
  SOURCE_MEANING_COL: 2, // Column C: Optional meaning/context
  MASTER_SHEET_NAME: "master_list",
  CHUNK_SIZE: 5, // Number of words to process in one API call

  // Mapping of result keys to column numbers (where the AI writes back)
  RESULTS_MAPPING: {
    reading: 3, // Column B
    kanji: 4, // Column D
    type: 5, // Column E
    sentence_jp: 6, // Column F
    sentence_vn: 7, // Column G
    level: 8, // Column H
  },
};

const GEMINI_API_KEY =
  PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
// const MODEL_NAME = "gemini-2.5-flash-lite";
const MODEL_NAME = "gemini-3.1-flash-lite-preview";

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("J-Study Tools")
    .addItem("Generate Data for Selected Rows", "fillVocabData")
    .addItem("Move New Words to Master", "moveToMaster")
    .addToUi();
}

/**
 * Validates API Key.
 */
function validateSetup() {
  if (!GEMINI_API_KEY) {
    SpreadsheetApp.getUi().alert(
      "MISSING API KEY:\n\n1. Go to Project Settings (gear icon).\n2. Add a Script Property named 'GEMINI_API_KEY'.\n3. Get a free key at: https://aistudio.google.com/app/apikey"
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

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const range = sheet.getActiveRange();
  const startRow = range.getRow();
  const numRows = range.getNumRows();

  // 1. Collect valid words into a list
  const wordsToProcess = [];
  for (let i = 0; i < numRows; i++) {
    const currentRow = startRow + i;
    const expression = sheet
      .getRange(currentRow, CONFIG.SOURCE_EXPRESSION_COL)
      .getValue();
    const meaning = sheet
      .getRange(currentRow, CONFIG.SOURCE_MEANING_COL)
      .getValue();

    if (
      !expression ||
      expression.toString().toLowerCase().includes("expression")
    )
      continue;

    wordsToProcess.push({
      expression: expression.toString().trim(),
      meaning: meaning.toString().trim(),
      row: currentRow,
    });
  }

  if (wordsToProcess.length === 0) {
    SpreadsheetApp.getUi().alert("No valid words selected.");
    return;
  }

  // 2. Get known vocab for context
  const masterSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
    CONFIG.MASTER_SHEET_NAME,
  );
  const knownVocab = masterSheet
    ? masterSheet.getRange("A:A").getValues().flat().filter(String).join(", ")
    : "";

  // 3. Process in chunks
  for (let i = 0; i < wordsToProcess.length; i += CONFIG.CHUNK_SIZE) {
    const chunk = wordsToProcess.slice(i, i + CONFIG.CHUNK_SIZE);
    processBatch(sheet, chunk, knownVocab);

    // Status update (optional)
    const progress = Math.min(i + CONFIG.CHUNK_SIZE, wordsToProcess.length);
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `Processed ${progress} of ${wordsToProcess.length} words...`,
    );
  }

  SpreadsheetApp.getUi().alert(
    `Successfully processed ${wordsToProcess.length} words.`,
  );
}

/**
 * Sends a batch of words to Gemini and writes back results.
 */
function processBatch(sheet, chunk, knownVocab) {
  const prompt = `
Act as a Senior Japanese Language Instructor specializing in absolute beginners (JLPT N5). 
Generate linguistic data for these words: ${JSON.stringify(chunk.map((c) => ({ word: c.expression, context: c.meaning })))}

STRICT INSTRUCTIONS:
1. GRAMMAR: Use SIMPLE grammar suitable for N5 beginners. Avoid complex particles or nested clauses.
2. VOCABULARY: For example sentences, strictly prioritize using words from this known list: [${knownVocab}]. Avoid introducing new or advanced words unless absolutely necessary for the sentence to make sense.
3. UNKNOWN DATA: If Kanji or Word Type cannot be confidently determined, return null or an empty string. NEVER hallucinate information.
4. TENSE: Ensure the grammatical tense matches the context, but keep it simple (Past/Present/Future).
5. FORMAT: Provide Kanji (leave null if not available), Reading (Kana), Word Type (e.g. Noun, Verb-u), a simple sentence, and its Vietnamese translation. Note only the sentence translation should be in Vietnamese.
6. PITCH ACCENT: Use standard Tokyo dialect. Provide the Pitch Accent Type as a number in brackets [0, 1, 2, 3, etc.] appended to the "reading" field.
   - [0] = Heiban (Flat): だいがく [0]
   - [1] = Atamadaka (Head-high): あめ [1]
   - [2], [3]... = Nakadaka/Odaka (Middle/Tail-high): たまご [2], はし [2]
   - UNKNOWN: If the pitch accent is unknown or uncertain, provide the reading with NO brackets.
   Include this number directly in the "reading" field.

Return ONLY a JSON array of objects following this exact schema:
[
  {
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

    // Results is expected to be an array. Map back to rows.
    if (!Array.isArray(results)) {
      throw new Error(
        "AI did not return an array. Response: " + JSON.stringify(results),
      );
    }

    results.forEach((res) => {
      // Find the corresponding input word in our chunk to get the row
      const originalEntry = chunk.find(
        (c) =>
          c.expression.toLowerCase() === res.input_word.toLowerCase() ||
          res.input_word.toLowerCase().includes(c.expression.toLowerCase()),
      );

      if (originalEntry) {
        for (const [key, col] of Object.entries(CONFIG.RESULTS_MAPPING)) {
          if (res[key])
            sheet.getRange(originalEntry.row, col).setValue(res[key]);
        }
      }
    });

    Utilities.sleep(1000); // Prevent rate limiting between chunks
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
    // Copy headers from source sheet to master
    const headers = sourceSheet
      .getRange(1, 1, 1, sourceSheet.getLastColumn())
      .getValues();
    masterSheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `Created missing '${CONFIG.MASTER_SHEET_NAME}' sheet.`,
    );
  }

  if (sourceSheet.getName() === CONFIG.MASTER_SHEET_NAME) {
    SpreadsheetApp.getUi().alert("You are already on the Master List sheet.");
    return;
  }

  const sourceData = sourceSheet.getDataRange().getValues();
  const masterData = masterSheet.getDataRange().getValues();

  // Use Column A (Index 0) as the unique ID for words
  const existingWords = new Set(
    masterData.map((row) => row[0].toString().trim().toLowerCase()),
  );

  const newRows = [];
  for (let i = 1; i < sourceData.length; i++) {
    let word = sourceData[i][0].toString().trim();
    if (word && !existingWords.has(word.toLowerCase())) {
      newRows.push([word]);
    }
  }

  if (newRows.length > 0) {
    masterSheet
      .getRange(
        masterSheet.getLastRow() + 1,
        1,
        newRows.length,
        1,
      )
      .setValues(newRows);
    SpreadsheetApp.getUi().alert(
      `Added ${newRows.length} new words to Master List.`,
    );
  } else {
    SpreadsheetApp.getUi().alert("No new words found to add.");
  }
}
