/**
 * Centralised date format constants for Nigerian locale (WAT / Africa/Lagos).
 *
 * Every module should import from here so the format stays uniform.
 */

/** "dd MMMM yyyy" → e.g. "23 February 2026" */
export const NG_DATE = 'dd MMMM yyyy';

/** "dd MMMM yyyy HH:mm:ss" — for activity logs & timestamps */
export const NG_DATETIME = 'dd MMMM yyyy HH:mm:ss';

/** "dd MMMM yyyy, h:mm a" — for user-facing date-time with AM/PM */
export const NG_DATETIME_AMPM = 'dd MMMM yyyy, h:mm a';

/** "dd MMMM" — short day + month (birthdays etc.) */
export const NG_DATE_SHORT = 'dd MMMM';

/** "dd/MM/yyyy" — for export spreadsheets */
export const NG_DATE_EXPORT = 'dd/MM/yyyy';

/** "dd MMMM yyyy HH:mm" — datetime without seconds */
export const NG_DATETIME_SHORT = 'dd MMMM yyyy HH:mm';
