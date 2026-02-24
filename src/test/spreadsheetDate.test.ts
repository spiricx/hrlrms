import { describe, it, expect } from 'vitest';
import { parseSpreadsheetDate } from '../lib/spreadsheetDate';

describe('parseSpreadsheetDate', () => {
  it('returns null for empty/null/undefined', () => {
    expect(parseSpreadsheetDate(null)).toBeNull();
    expect(parseSpreadsheetDate(undefined)).toBeNull();
    expect(parseSpreadsheetDate('')).toBeNull();
  });

  it('parses Excel serial number 44582 → 2022-01-21', () => {
    // 44582 is the Excel serial for 21 January 2022
    expect(parseSpreadsheetDate(44582)).toBe('2022-01-21');
  });

  it('parses Excel serial number 44581 → 2022-01-20', () => {
    expect(parseSpreadsheetDate(44581)).toBe('2022-01-20');
  });

  it('parses DD/MM/YYYY string → 2022-01-21', () => {
    expect(parseSpreadsheetDate('21/01/2022')).toBe('2022-01-21');
  });

  it('parses YYYY-MM-DD string → 2021-03-24', () => {
    expect(parseSpreadsheetDate('2021-03-24')).toBe('2021-03-24');
  });

  it('parses "21st January 2022" textual date', () => {
    expect(parseSpreadsheetDate('21st January 2022')).toBe('2022-01-21');
  });

  it('parses "January 21, 2022" textual date', () => {
    expect(parseSpreadsheetDate('January 21, 2022')).toBe('2022-01-21');
  });

  it('handles Date object without timezone shift', () => {
    // Simulate a UTC midnight date (common from JSON/ISO parsing)
    const d = new Date('2022-01-21T00:00:00Z');
    expect(parseSpreadsheetDate(d)).toBe('2022-01-21');
  });

  it('rejects invalid dates', () => {
    expect(parseSpreadsheetDate('32/13/2022')).toBeNull();
    expect(parseSpreadsheetDate('not-a-date')).toBeNull();
  });

  it('parses ISO datetime string preserving date part only', () => {
    expect(parseSpreadsheetDate('2022-01-21T12:30:00+01:00')).toBe('2022-01-21');
  });
});
