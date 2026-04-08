const ora = require('ora').default;

/**
 * Create a spinner for indeterminate-duration tasks.
 * @param {string} text - Initial text to display
 * @returns {object} ora spinner instance
 */
function makeSpinner(text) {
  return ora(text).start();
}

/**
 * Show progress bar with fill indicator.
 * Overwrites previous line on terminal.
 * @param {number} current - Current progress count
 * @param {number} total - Total count
 */
function showProgress(current, total) {
  const barLength = 40;
  const progress = Math.min(Math.max(current / total, 0), 1);
  const filledLength = Math.round(barLength * progress);
  const bar = '█'.repeat(filledLength) + '-'.repeat(barLength - filledLength);
  process.stdout.write(`\r[${bar}] ${Math.round(progress * 100)}% (${current}/${total})`);
  if (current === total) process.stdout.write('\n');
}

module.exports = { makeSpinner, showProgress };
