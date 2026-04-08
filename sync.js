const axios = require('axios');
const { parse } = require("csv-parse/sync");

const { loadConfig } = require('./lib/config');
const { getAnkiDataMap } = require('./lib/anki');
const { validateSetup } = require('./lib/validate');
const { buildSyncPlan } = require('./lib/planner');
const { printDryRunSummary } = require('./lib/reporter');
const { executeUpdates, executeAdditions } = require('./lib/executor');
const { makeSpinner } = require('./lib/progress');

async function sync() {
  const config = loadConfig();

  // 1. Fetch CSV
  const spinner = makeSpinner("Fetching CSV data from Google Sheets...");
  try {
    const res = await axios.get(config.sheet_csv_url);
    const records = parse(res.data, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (records.length === 0) {
      spinner.warn("No data found in CSV.");
      return;
    }

    spinner.succeed(`Fetched ${records.length} records`);

    // 2. Validate setup
    const validateSpinner = makeSpinner("Validating setup...");
    try {
      await validateSetup(config, Object.keys(records[0]));
      validateSpinner.succeed("Setup validated");
    } catch (err) {
      validateSpinner.fail("Setup validation failed");
      throw err;
    }

    // 3. Get existing notes for smart diffing
    const fetchSpinner = makeSpinner("Loading Anki notes...");
    try {
      const firstSheetCol = Object.keys(config.mapping)[0];
      const firstAnkiField = config.mapping[firstSheetCol];
      const ankiDataMap = await getAnkiDataMap(config.anki_deck, config.anki_model, firstAnkiField);
      fetchSpinner.succeed(`Loaded ${ankiDataMap.size} existing notes`);

      // 4. Build sync plan (diff and classify changes)
      const { notesToAdd, notesToUpdate } = await buildSyncPlan(records, config, ankiDataMap);

      // 5. Handle dry-run or execute
      if (config.dry_run) {
        await printDryRunSummary(notesToAdd, notesToUpdate);
        return;
      }

      // 6. Execute updates and additions
      await executeUpdates(notesToUpdate);
      await executeAdditions(notesToAdd);

      // 7. Final status
      if (notesToAdd.length === 0 && notesToUpdate.length === 0) {
        console.log('No changes detected. Everything is already in sync!');
      } else {
        console.log('Sync complete!');
      }
    } catch (err) {
      fetchSpinner.fail("Failed to load Anki notes");
      throw err;
    }
  } catch (err) {
    if (err.spinner) spinner.fail("Failed to fetch CSV");
    throw err;
  }
}

sync().catch((err) => {
  console.error("\nSync failed:", err.message);
});
