const { ankiAction } = require('./anki');

async function validateSetup(config, csvHeaders) {
  console.log("Validating setup...");

  // 1. Validate Sheet Columns
  const missingCols = Object.keys(config.mapping).filter(
    (col) => !csvHeaders.includes(col),
  );
  if (missingCols.length > 0) {
    throw new Error(
      `Sheet column(s) not found in CSV: ${missingCols.join(", ")}. Please check your mapping in config.json.`,
    );
  }

  // 2. Validate/Create Anki Deck
  const deckNamesResult = await ankiAction("deckNames");
  if (!deckNamesResult.success) {
    throw new Error(`Failed to get deck names: ${deckNamesResult.error}`);
  }

  if (!deckNamesResult.data.includes(config.anki_deck)) {
    console.log(`Anki deck "${config.anki_deck}" not found. Attempting to create it...`);
    const createDeckResult = await ankiAction("createDeck", { deck: config.anki_deck });
    if (!createDeckResult.success) {
      throw new Error(`Failed to create Anki deck "${config.anki_deck}": ${createDeckResult.error}`);
    }
    console.log(`Anki deck "${config.anki_deck}" created.`);
  }

  // 3. Validate Anki Model (Note Type)
  const modelNamesResult = await ankiAction("modelNames");
  if (!modelNamesResult.success) {
    throw new Error(`Failed to get model names: ${modelNamesResult.error}`);
  }

  if (!modelNamesResult.data.includes(config.anki_model)) {
    throw new Error(
      `Anki Note Type "${config.anki_model}" not found.\n` +
        `Please import the appropriate .apkg file from the 'templates/' folder, ` +
        `or create this Note Type manually in Anki.`,
    );
  }

  // 4. Validate Anki Fields
  const modelFieldNamesResult = await ankiAction("modelFieldNames", {
    modelName: config.anki_model,
  });
  if (!modelFieldNamesResult.success) {
    throw new Error(
      `Failed to get model field names for "${config.anki_model}": ${modelFieldNamesResult.error}`,
    );
  }
  const modelFields = modelFieldNamesResult.data;

  const mappedAnkiFields = Object.values(config.mapping);
  if (config.audio_field) mappedAnkiFields.push(config.audio_field);
  if (config.sentence_audio_field) mappedAnkiFields.push(config.sentence_audio_field);

  const missingFields = mappedAnkiFields.filter((f) => !modelFields.includes(f));
  if (missingFields.length > 0) {
    throw new Error(
      `Anki field(s) not found in Note Type "${config.anki_model}": ${missingFields.join(", ")}.`,
    );
  }

  console.log("Validation successful.");
}

module.exports = { validateSetup };
