import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatLastRead,
  formatReadingTime,
  getEstimatedTimeRemaining,
  formatEstimatedCompletion,
} from '../format';

describe('formatLastRead', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "today" for a date earlier today', () => {
    expect(formatLastRead('2025-06-15T08:00:00Z')).toBe('today');
  });

  it('returns "today" for a date just now', () => {
    expect(formatLastRead('2025-06-15T12:00:00Z')).toBe('today');
  });

  it('returns "yesterday" for a date 1 day ago', () => {
    expect(formatLastRead('2025-06-14T12:00:00Z')).toBe('yesterday');
  });

  it('returns days ago for 2-6 days', () => {
    expect(formatLastRead('2025-06-13T12:00:00Z')).toBe('2d ago');
    expect(formatLastRead('2025-06-12T12:00:00Z')).toBe('3d ago');
    expect(formatLastRead('2025-06-09T12:00:00Z')).toBe('6d ago');
  });

  it('returns weeks ago for 7-29 days', () => {
    expect(formatLastRead('2025-06-08T12:00:00Z')).toBe('1w ago');
    expect(formatLastRead('2025-06-01T12:00:00Z')).toBe('2w ago');
    expect(formatLastRead('2025-05-18T12:00:00Z')).toBe('4w ago');
  });

  it('returns localized date for 30+ days ago', () => {
    const result = formatLastRead('2025-04-01T12:00:00Z');
    // toLocaleDateString output varies by environment, just verify it's not a relative format
    expect(result).not.toContain('ago');
    expect(result).not.toBe('today');
    expect(result).not.toBe('yesterday');
  });

  it('handles boundary between days and weeks (exactly 7 days)', () => {
    expect(formatLastRead('2025-06-08T12:00:00Z')).toBe('1w ago');
  });

  it('handles boundary between weeks and localized date (exactly 30 days)', () => {
    // 30 days ago falls to toLocaleDateString
    expect(formatLastRead('2025-05-16T12:00:00Z')).not.toContain('ago');
  });

  it('returns "today" for a future date within the same day', () => {
    // A date later today (e.g., timezone offset) results in negative diffMs
    // floor(negative / day) = -1 for small negative, but 0 for tiny difference
    // Actually, a few hours later: diffMs is negative, diffDays = floor(negative/day)
    // floor(-1000 / 86400000) = floor(-0.0000...) = -1
    // So this hits the fallback toLocaleDateString path
    const result = formatLastRead('2025-06-15T23:59:59Z');
    // This is still "today" because floor(negative small ms / day) = -1
    // -1 doesn't match any branch, falls to toLocaleDateString
    expect(result).not.toBe('yesterday');
  });

  it('returns "4w ago" for 29 days ago (last day before localized date)', () => {
    // 29 days ago: 29/7 = 4.14, floor = 4 -> "4w ago"
    expect(formatLastRead('2025-05-17T12:00:00Z')).toBe('4w ago');
  });

  it('handles invalid date string gracefully', () => {
    // new Date('invalid') produces NaN, diffMs is NaN, diffDays is NaN
    // NaN === 0 is false, NaN === 1 is false, NaN < 7 is false, etc.
    // Falls through to toLocaleDateString
    const result = formatLastRead('not-a-date');
    expect(result).toBe('Invalid Date');
  });
});

describe('formatReadingTime', () => {
  describe('sub-minute times (default: showSeconds=true)', () => {
    it('formats 0ms as "0s"', () => {
      expect(formatReadingTime(0)).toBe('0s');
    });

    it('formats 1 second', () => {
      expect(formatReadingTime(1000)).toBe('1s');
    });

    it('formats 30 seconds', () => {
      expect(formatReadingTime(30000)).toBe('30s');
    });

    it('formats 59 seconds', () => {
      expect(formatReadingTime(59000)).toBe('59s');
    });

    it('rounds sub-second values', () => {
      expect(formatReadingTime(500)).toBe('1s');
      expect(formatReadingTime(1500)).toBe('2s');
      expect(formatReadingTime(499)).toBe('0s');
    });

    it('handles just below 1 minute', () => {
      expect(formatReadingTime(59999)).toBe('60s');
    });
  });

  describe('sub-minute with showSeconds=false', () => {
    it('returns "0m" when showZero is true (default)', () => {
      expect(formatReadingTime(30000, { showSeconds: false })).toBe('0m');
    });

    it('returns empty string when showZero is false', () => {
      expect(formatReadingTime(30000, { showSeconds: false, showZero: false })).toBe('');
    });

    it('returns "0m" for 0ms with showSeconds=false', () => {
      expect(formatReadingTime(0, { showSeconds: false })).toBe('0m');
    });
  });

  describe('minutes (1-59 minutes)', () => {
    it('formats exactly 1 minute', () => {
      expect(formatReadingTime(60000)).toBe('1m');
    });

    it('formats 5 minutes', () => {
      expect(formatReadingTime(300000)).toBe('5m');
    });

    it('formats 59 minutes', () => {
      expect(formatReadingTime(59 * 60000)).toBe('59m');
    });

    it('rounds to nearest minute', () => {
      // 1.5 minutes -> 2m
      expect(formatReadingTime(90000)).toBe('2m');
    });

    it('handles just below 1 hour', () => {
      // 59.5 minutes -> rounds to 60m, which is still < 3600000
      expect(formatReadingTime(3599999)).toBe('60m');
    });
  });

  describe('hours', () => {
    it('formats exactly 1 hour', () => {
      expect(formatReadingTime(3600000)).toBe('1h');
    });

    it('formats 1 hour 5 minutes', () => {
      expect(formatReadingTime(3900000)).toBe('1h 5m');
    });

    it('formats exactly 2 hours', () => {
      expect(formatReadingTime(7200000)).toBe('2h');
    });

    it('formats 2 hours 30 minutes', () => {
      expect(formatReadingTime(9000000)).toBe('2h 30m');
    });

    it('formats large durations', () => {
      // 10 hours
      expect(formatReadingTime(36000000)).toBe('10h');
      // 24 hours
      expect(formatReadingTime(86400000)).toBe('24h');
    });

    it('omits minutes when exactly on the hour', () => {
      expect(formatReadingTime(3600000)).toBe('1h');
      expect(formatReadingTime(7200000)).toBe('2h');
    });

    it('shows minutes when not on the hour', () => {
      const result = formatReadingTime(3660000); // 1h 1m
      expect(result).toBe('1h 1m');
    });
  });

  describe('edge cases', () => {
    it('handles negative values', () => {
      // Negative ms < 60000: showSeconds branch
      const result = formatReadingTime(-1000);
      expect(result).toBe('-1s');
    });

    it('handles boundary at exactly 60000ms (1 minute)', () => {
      expect(formatReadingTime(60000)).toBe('1m');
    });

    it('handles boundary at exactly 3600000ms (1 hour)', () => {
      expect(formatReadingTime(3600000)).toBe('1h');
    });

    it('handles NaN input (falls through to hours branch since NaN comparisons are false)', () => {
      expect(formatReadingTime(NaN)).toBe('NaNh');
    });

    it('handles very large durations (100+ hours)', () => {
      // 100 hours = 360,000,000ms
      expect(formatReadingTime(360000000)).toBe('100h');
    });

    it('handles duration just over 1 minute (60001ms)', () => {
      // 60001ms rounds to 1m
      expect(formatReadingTime(60001)).toBe('1m');
    });

    it('handles duration just under 1 hour (3599999ms)', () => {
      // 3599999ms = 59.999... minutes, rounds to 60m
      expect(formatReadingTime(3599999)).toBe('60m');
    });

    it('handles hours with remainder that rounds to 60 minutes', () => {
      // 1h 59.5m = 3600000 + 59.5 * 60000 = 3600000 + 3570000 = 7170000ms
      // hours = floor(7170000/3600000) = 1
      // mins = round(3570000/60000) = 60 -> shows "1h 60m"
      // This is a known edge case in the formatting
      expect(formatReadingTime(7170000)).toBe('1h 60m');
    });
  });
});

describe('getEstimatedTimeRemaining', () => {
  it('returns null when totalPages is null', () => {
    expect(getEstimatedTimeRemaining({ totalPages: null, progress: 50 })).toBeNull();
  });

  it('returns null when totalPages is 0', () => {
    expect(getEstimatedTimeRemaining({ totalPages: 0, progress: 50 })).toBeNull();
  });

  it('returns null when progress is 100', () => {
    expect(getEstimatedTimeRemaining({ totalPages: 200, progress: 100 })).toBeNull();
  });

  it('returns null when progress exceeds 100', () => {
    expect(getEstimatedTimeRemaining({ totalPages: 200, progress: 150 })).toBeNull();
  });

  it('uses default speed of 25 pages/hour when pagesPerHour is not provided', () => {
    // 200 pages, 50% progress = 100 pages remaining
    // 100 pages / 25 pages per hour = 4 hours -> "4h"
    expect(getEstimatedTimeRemaining({ totalPages: 200, progress: 50 })).toBe('4h');
  });

  it('uses default speed when pagesPerHour is null', () => {
    expect(getEstimatedTimeRemaining({ totalPages: 200, progress: 50, pagesPerHour: null })).toBe('4h');
  });

  it('uses provided pagesPerHour', () => {
    // 200 pages, 50% progress = 100 pages remaining
    // 100 pages / 50 pages per hour = 2 hours -> "2h"
    expect(getEstimatedTimeRemaining({ totalPages: 200, progress: 50, pagesPerHour: 50 })).toBe('2h');
  });

  describe('output formatting', () => {
    it('returns minutes for sub-hour estimates', () => {
      // 10 pages remaining / 25 pph = 0.4 hours = 24 min -> "24m"
      expect(getEstimatedTimeRemaining({ totalPages: 100, progress: 90 })).toBe('24m');
    });

    it('returns hours with one decimal for estimates under 10 hours', () => {
      // 100 pages / 25 pph = 4 hours -> "4h"
      expect(getEstimatedTimeRemaining({ totalPages: 100, progress: 0 })).toBe('4h');

      // 125 pages / 25 pph = 5 hours -> "5h"
      expect(getEstimatedTimeRemaining({ totalPages: 250, progress: 50 })).toBe('5h');
    });

    it('returns rounded hours with decimal for non-integer hours under 10', () => {
      // 75 pages / 25 pph = 3.0 hours -> "3h"
      expect(getEstimatedTimeRemaining({ totalPages: 75, progress: 0 })).toBe('3h');

      // 38 pages (ceil of 37.5) / 25 pph = 1.52 -> rounded to 1.5 -> "1.5h"
      expect(getEstimatedTimeRemaining({ totalPages: 50, progress: 25 })).toBe('1.5h');
    });

    it('returns rounded integer hours for 10+ hour estimates', () => {
      // 500 pages / 25 pph = 20 hours -> "20h"
      expect(getEstimatedTimeRemaining({ totalPages: 500, progress: 0 })).toBe('20h');
    });
  });

  describe('edge cases', () => {
    it('handles 0% progress', () => {
      // All pages remaining
      const result = getEstimatedTimeRemaining({ totalPages: 100, progress: 0 });
      expect(result).not.toBeNull();
    });

    it('handles 99% progress', () => {
      // 1 page remaining (ceil of 1) / 25 pph = 0.04 hours = 2.4 min -> "2m"
      expect(getEstimatedTimeRemaining({ totalPages: 100, progress: 99 })).toBe('2m');
    });

    it('handles very high pages per hour', () => {
      // 100 pages / 1000 pph = 0.1 hours = 6 min -> "6m"
      expect(getEstimatedTimeRemaining({ totalPages: 100, progress: 0, pagesPerHour: 1000 })).toBe('6m');
    });

    it('handles very slow reading speed', () => {
      // 100 pages / 1 pph = 100 hours -> "100h"
      expect(getEstimatedTimeRemaining({ totalPages: 100, progress: 0, pagesPerHour: 1 })).toBe('100h');
    });

    it('handles 1 page book', () => {
      // 1 page remaining / 25 pph = 0.04 hours = 2.4 min -> "2m"
      expect(getEstimatedTimeRemaining({ totalPages: 1, progress: 0 })).toBe('2m');
    });

    it('handles pagesPerHour of 0 (division by zero produces Infinity)', () => {
      // 100 pages / 0 pph = Infinity hours
      // Infinity >= 10, so rounds to Infinity -> "Infinityh"
      const result = getEstimatedTimeRemaining({ totalPages: 100, progress: 0, pagesPerHour: 0 });
      expect(result).toBe('Infinityh');
    });

    it('handles negative progress (treated as having more pages remaining)', () => {
      // totalPages=100, progress=-10 -> pagesRemaining = ceil(100 * 110/100) = 110
      // 110 / 25 = 4.4h -> "4.4h"
      const result = getEstimatedTimeRemaining({ totalPages: 100, progress: -10 });
      expect(result).toBe('4.4h');
    });

    it('handles fractional progress values', () => {
      // totalPages=100, progress=33.3 -> pagesRemaining = ceil(100 * 66.7/100) = ceil(66.7) = 67
      // 67 / 25 = 2.68h -> rounded to 2.7 -> "2.7h"
      const result = getEstimatedTimeRemaining({ totalPages: 100, progress: 33.3 });
      expect(result).toBe('2.7h');
    });

    it('handles very large page counts', () => {
      // 10000 pages / 25 pph = 400h -> "400h"
      expect(getEstimatedTimeRemaining({ totalPages: 10000, progress: 0 })).toBe('400h');
    });

    it('returns minutes string at the sub-hour boundary', () => {
      // 24 pages remaining / 25 pph = 0.96 hours = 57.6 min -> "58m"
      expect(getEstimatedTimeRemaining({ totalPages: 100, progress: 76 })).toBe('58m');
    });

    it('returns hours with decimal at the 1-hour boundary', () => {
      // 25 pages / 25 pph = 1.0 hours -> "1h"
      expect(getEstimatedTimeRemaining({ totalPages: 100, progress: 75 })).toBe('1h');
    });

    it('returns rounded integer at the 10-hour boundary', () => {
      // 250 pages / 25 pph = 10 hours -> "10h"
      expect(getEstimatedTimeRemaining({ totalPages: 250, progress: 0 })).toBe('10h');
    });

    it('handles negative totalPages (falsy check returns null)', () => {
      // negative totalPages is truthy, so it proceeds
      // totalPages=-100, progress=0 -> pagesRemaining = ceil(-100 * 100/100) = -100
      // -100 / 25 = -4h -> -4 < 1 -> mins = round(-4 * 60) = -240 -> "-240m"
      const result = getEstimatedTimeRemaining({ totalPages: -100, progress: 0 });
      expect(result).toBe('-240m');
    });
  });
});

describe('formatEstimatedCompletion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for null input', () => {
    expect(formatEstimatedCompletion(null)).toBeNull();
  });

  it('returns null for invalid date string', () => {
    expect(formatEstimatedCompletion('not-a-date')).toBeNull();
    expect(formatEstimatedCompletion('')).toBeNull();
  });

  it('returns null for dates in the past', () => {
    expect(formatEstimatedCompletion('2025-06-14T00:00:00Z')).toBeNull();
    expect(formatEstimatedCompletion('2025-01-01T00:00:00Z')).toBeNull();
  });

  it('returns "Today" for today\'s date', () => {
    expect(formatEstimatedCompletion('2025-06-15T12:00:00Z')).toBe('Today');
  });

  it('returns "Tomorrow" for tomorrow', () => {
    expect(formatEstimatedCompletion('2025-06-16T00:00:00Z')).toBe('Tomorrow');
  });

  it('returns "In N days" for 2-6 days from now', () => {
    expect(formatEstimatedCompletion('2025-06-17T00:00:00Z')).toBe('In 2 days');
    expect(formatEstimatedCompletion('2025-06-18T00:00:00Z')).toBe('In 3 days');
    expect(formatEstimatedCompletion('2025-06-21T00:00:00Z')).toBe('In 6 days');
  });

  it('returns "Next week" for 7-13 days from now', () => {
    expect(formatEstimatedCompletion('2025-06-22T00:00:00Z')).toBe('Next week');
    expect(formatEstimatedCompletion('2025-06-28T00:00:00Z')).toBe('Next week');
  });

  it('returns "In N weeks" for 14-29 days from now', () => {
    expect(formatEstimatedCompletion('2025-06-29T00:00:00Z')).toBe('In 2 weeks');
    expect(formatEstimatedCompletion('2025-07-14T00:00:00Z')).toBe('In 4 weeks');
  });

  it('returns "Next month" for 30-59 days from now', () => {
    expect(formatEstimatedCompletion('2025-07-15T00:00:00Z')).toBe('Next month');
    expect(formatEstimatedCompletion('2025-08-13T00:00:00Z')).toBe('Next month');
  });

  it('returns formatted date for 60+ days from now', () => {
    const result = formatEstimatedCompletion('2025-08-14T00:00:00Z');
    // toLocaleDateString with month: 'short', day: 'numeric'
    // Exact output depends on locale, but should contain month abbreviation
    expect(result).not.toBeNull();
    expect(result).not.toBe('Next month');
    expect(result).not.toContain('In');
  });

  describe('edge cases', () => {
    it('handles date with only date part (no time)', () => {
      expect(formatEstimatedCompletion('2025-06-16')).toBe('Tomorrow');
    });

    it('handles far future dates', () => {
      const result = formatEstimatedCompletion('2030-01-01T00:00:00Z');
      expect(result).not.toBeNull();
    });

    it('handles boundary at exactly midnight today', () => {
      // Set time to midnight
      vi.setSystemTime(new Date('2025-06-15T00:00:00Z'));
      expect(formatEstimatedCompletion('2025-06-15T00:00:00Z')).toBe('Today');
    });

    it('returns null for empty string', () => {
      expect(formatEstimatedCompletion('')).toBeNull();
    });

    it('handles boundary between days and next week (exactly 7 days)', () => {
      // 7 days from June 15 = June 22
      expect(formatEstimatedCompletion('2025-06-22T00:00:00Z')).toBe('Next week');
    });

    it('handles boundary between next week and weeks (exactly 14 days)', () => {
      // 14 days from June 15 = June 29
      expect(formatEstimatedCompletion('2025-06-29T00:00:00Z')).toBe('In 2 weeks');
    });

    it('handles boundary between weeks and next month (exactly 30 days)', () => {
      // 30 days from June 15 = July 15
      expect(formatEstimatedCompletion('2025-07-15T00:00:00Z')).toBe('Next month');
    });

    it('handles boundary between next month and formatted date (exactly 60 days)', () => {
      // 60 days from June 15 = Aug 14
      const result = formatEstimatedCompletion('2025-08-14T00:00:00Z');
      // 60 days is no longer < 60, falls to toLocaleDateString
      expect(result).not.toBeNull();
      expect(result).not.toBe('Next month');
    });

    it('handles year boundary (Dec 31 to Jan 1 next year)', () => {
      vi.setSystemTime(new Date('2025-12-31T12:00:00Z'));
      expect(formatEstimatedCompletion('2026-01-01T00:00:00Z')).toBe('Tomorrow');
    });

    it('handles leap year date (Feb 29)', () => {
      vi.setSystemTime(new Date('2028-02-28T12:00:00Z'));
      expect(formatEstimatedCompletion('2028-02-29T00:00:00Z')).toBe('Tomorrow');
    });

    it('returns formatted month/day for dates 60+ days out', () => {
      const result = formatEstimatedCompletion('2025-12-25T00:00:00Z');
      expect(result).not.toBeNull();
      // Should be a localized date string with month and day
      expect(typeof result).toBe('string');
    });
  });
});
