import * as XLSX from 'xlsx';

const MONTH_INDEX: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function formatYmd(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  const date = new Date(year, month - 1, day);
  const isValid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  if (!isValid) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseMonthName(monthText: string): number | null {
  const clean = monthText.trim().toLowerCase();
  return MONTH_INDEX[clean] ?? null;
}

export function parseSpreadsheetDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return formatYmd(parsed.y, parsed.m, parsed.d);
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    // Prefer UTC parts to avoid timezone drift when source date is UTC-based.
    return (
      formatYmd(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()) ??
      formatYmd(value.getFullYear(), value.getMonth() + 1, value.getDate())
    );
  }

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;

    // ISO / datetime strings -> preserve literal date part only.
    const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (iso) {
      return formatYmd(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    }

    // Nigerian/common spreadsheet format: DD/MM/YYYY (or with - /. )
    const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (dmy) {
      return formatYmd(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
    }

    // 21st January 2022 / 21 January 2022
    const textualDayFirst = raw.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)\s*,?\s*(\d{4})$/i);
    if (textualDayFirst) {
      const month = parseMonthName(textualDayFirst[2]);
      if (month) {
        return formatYmd(Number(textualDayFirst[3]), month, Number(textualDayFirst[1]));
      }
    }

    // January 21, 2022 / January 21st 2022
    const textualMonthFirst = raw.match(/^([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})$/i);
    if (textualMonthFirst) {
      const month = parseMonthName(textualMonthFirst[1]);
      if (month) {
        return formatYmd(Number(textualMonthFirst[3]), month, Number(textualMonthFirst[2]));
      }
    }

    // If user typed an Excel serial as text (e.g. "44582")
    const serial = Number(raw);
    if (Number.isFinite(serial) && serial > 0) {
      const parsed = XLSX.SSF.parse_date_code(serial);
      if (parsed) {
        return formatYmd(parsed.y, parsed.m, parsed.d);
      }
    }
  }

  return null;
}
