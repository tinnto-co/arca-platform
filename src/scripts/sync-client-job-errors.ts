/**
 * DEPRECATED: This script is no longer needed.
 *
 * The hasErrors/errorMessage columns have been removed from the representative/client table.
 * Scraper error alerts are now created directly by the scrapper service via the alert table.
 *
 * This file is kept as a no-op to avoid breaking any existing references (e.g. package.json scripts).
 */

console.log(
  '[sync-client-job-errors] DEPRECATED — hasErrors/errorMessage columns removed. ' +
  'Scraper errors are now tracked via the alert table. Nothing to do.'
);
