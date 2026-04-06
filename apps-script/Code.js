/**
 * GETTING STARTED:
 * 1. In the Apps Script Editor, go to Project Settings (gear icon).
 * 2. Under "Script Properties", click "Edit script properties".
 * 3. Add a property with name: GEMINI_API_KEY and your actual key as the value.
 */
const GEMINI_API_KEY =
  PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
const MODEL_NAME = "gemini-2.5-flash-lite";

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("J-Study Tools")
    .addItem("Generate Data for Selected Rows", "fillVocabData")
    .addItem("Move New Words to Master", "moveToMaster")
    .addToUi();
}

/**
 * Processes all selected rows in bulk.
 */
function fillVocabData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const range = sheet.getActiveRange();
  const startRow = range.getRow();
  const numRows = range.getNumRows();

  const kbSheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("master_list");
  const knownVocab = kbSheet
    ? kbSheet.getRange("A:A").getValues().flat().filter(String).join(", ")
    : "";

  for (let i = 0; i < numRows; i++) {
    let currentRow = startRow + i;
    let expression = sheet.getRange(currentRow, 1).getValue();
    let meaning = sheet.getRange(currentRow, 3).getValue();

    if (!expression) continue; // Skip empty rows

    const prompt = `
Act as a Japanese linguist. For the word "${expression}" with meaning "${meaning}":
1. Provide the Kanji version.
1.a. Provide a Kana reading (in Hiragana or Katakana).
2. Identify word type (Noun, Verb-u, Verb-ru, Adjective-i, etc.).
3. Create a simple JP sentence using ONLY words from this list: [${knownVocab}] and basic N5 grammar.
4. Provide the Vietnamese translation of that sentence.
5. Categorize word into a level (N5, N4).

Return ONLY a JSON object with keys: kanji, reading, type, sentence_jp, sentence_vn, level.

Example:
{
  "kanji": "食べる",
  "reading": "たべる",
  "type": "Verb-ru",
  "sentence_jp": "私は朝ごはんを食べます。",
  "sentence_vn": "Tôi ăn sáng.",
  "level": "N5"
}
`;

    try {
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
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
        const apiError = jsonResponse.error
          ? `${jsonResponse.error.code}: ${jsonResponse.error.message}`
          : JSON.stringify(jsonResponse);
        SpreadsheetApp.getUi().alert(`API error on row ${currentRow}:\n${apiError}\n\nScript stopped.`);
        return;
      }
      const result = JSON.parse(
        jsonResponse.candidates[0].content.parts[0].text,
      );

      // Write results back to the row
      sheet.getRange(currentRow, 2).setValue(result.reading);
      sheet.getRange(currentRow, 4).setValue(result.kanji);
      sheet.getRange(currentRow, 5).setValue(result.type);
      sheet.getRange(currentRow, 6).setValue(result.sentence_jp);
      sheet.getRange(currentRow, 7).setValue(result.sentence_vn);
      sheet.getRange(currentRow, 8).setValue(result.level);

      // Small pause to avoid hitting rate limits on free API keys
      Utilities.sleep(500);
    } catch (e) {
      SpreadsheetApp.getUi().alert(`Unexpected error on row ${currentRow}:\n${e}\n\nScript stopped.`);
      return;
    }
  }
}

/**
 * Copies unique words from the current sheet to master_list.
 */
function moveToMaster() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getActiveSheet();
  const masterSheet = ss.getSheetByName("master_list");

  if (!masterSheet) {
    SpreadsheetApp.getUi().alert(
      "Please create a sheet named 'master_list' first.",
    );
    return;
  }

  if (sourceSheet.getName() === "master_list") {
    SpreadsheetApp.getUi().alert("You are already on the Master List sheet.");
    return;
  }

  const sourceData = sourceSheet.getDataRange().getValues();
  const masterData = masterSheet.getDataRange().getValues();

  // Create a Set of existing words in Master (Column A is index 0)
  const existingWords = new Set(
    masterData.map((row) => row[0].toString().trim()),
  );
  const newRows = [];

  // Skip header row (index 0)
  for (let i = 1; i < sourceData.length; i++) {
    let word = sourceData[i][0].toString().trim();
    if (word && !existingWords.has(word)) {
      newRows.push(sourceData[i]);
    }
  }

  if (newRows.length > 0) {
    masterSheet
      .getRange(
        masterSheet.getLastRow() + 1,
        1,
        newRows.length,
        newRows[0].length,
      )
      .setValues(newRows);
    SpreadsheetApp.getUi().alert(
      `Successfully added ${newRows.length} new words to Master List.`,
    );
  } else {
    SpreadsheetApp.getUi().alert("No new words found to add.");
  }
}
