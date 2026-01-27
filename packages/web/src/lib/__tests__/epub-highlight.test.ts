import { describe, it, expect } from 'vitest';
import {
  parseCFI,
  compareCFI,
  isCFIInRange,
  extractTextFromCFI,
  formatCFIForDisplay,
} from '../epub-highlight';

describe('parseCFI', () => {
  it('parses a simple CFI with a single path', () => {
    const result = parseCFI('epubcfi(/6/4)');
    expect(result).toEqual({ path: '/6/4' });
  });

  it('parses a CFI range with comma-separated parts', () => {
    const result = parseCFI('epubcfi(/6/4,/1:0,/1:10)');
    expect(result).toEqual({ path: '/6/4/1:0', offset: undefined });
  });

  it('returns null for a string without epubcfi() wrapper', () => {
    expect(parseCFI('/6/4')).toBeNull();
    expect(parseCFI('not a cfi')).toBeNull();
    expect(parseCFI('')).toBeNull();
  });

  it('returns null for malformed epubcfi with no content', () => {
    // epubcfi() with empty parens still matches the regex since (.+) requires 1+ chars
    expect(parseCFI('epubcfi()')).toBeNull();
  });

  it('handles complex CFI paths', () => {
    const result = parseCFI('epubcfi(/6/14!/4/2/1:0)');
    expect(result).toEqual({ path: '/6/14!/4/2/1:0' });
  });

  it('handles CFI with text hints in brackets', () => {
    const result = parseCFI('epubcfi(/6/4[chap01])');
    expect(result).toEqual({ path: '/6/4[chap01]' });
  });

  it('handles CFI range with three comma-separated parts', () => {
    const result = parseCFI('epubcfi(/6/4,/2:5,/3:12)');
    // path = parts[0] + parts[1] = '/6/4' + '/2:5'
    expect(result).toEqual({ path: '/6/4/2:5', offset: undefined });
  });
});

describe('compareCFI', () => {
  it('returns 0 for identical CFIs', () => {
    expect(compareCFI('epubcfi(/6/4)', 'epubcfi(/6/4)')).toBe(0);
  });

  it('returns negative when first CFI sorts before second', () => {
    expect(compareCFI('epubcfi(/6/2)', 'epubcfi(/6/4)')).toBeLessThan(0);
  });

  it('returns positive when first CFI sorts after second', () => {
    expect(compareCFI('epubcfi(/6/4)', 'epubcfi(/6/2)')).toBeGreaterThan(0);
  });

  it('handles lexicographic comparison of different-length strings', () => {
    // Lexicographic: shorter string that is a prefix sorts before longer
    expect(compareCFI('epubcfi(/6/4)', 'epubcfi(/6/40)')).toBeLessThan(0);
  });

  it('compares empty strings', () => {
    expect(compareCFI('', '')).toBe(0);
  });
});

describe('isCFIInRange', () => {
  it('returns true when CFI is between start and end', () => {
    expect(isCFIInRange('b', 'a', 'c')).toBe(true);
  });

  it('returns true when CFI equals the start boundary', () => {
    expect(isCFIInRange('a', 'a', 'c')).toBe(true);
  });

  it('returns true when CFI equals the end boundary', () => {
    expect(isCFIInRange('c', 'a', 'c')).toBe(true);
  });

  it('returns false when CFI is before the start', () => {
    expect(isCFIInRange('a', 'b', 'c')).toBe(false);
  });

  it('returns false when CFI is after the end', () => {
    expect(isCFIInRange('d', 'a', 'c')).toBe(false);
  });

  it('handles range where start equals end (single point)', () => {
    expect(isCFIInRange('b', 'b', 'b')).toBe(true);
    expect(isCFIInRange('a', 'b', 'b')).toBe(false);
  });
});

describe('extractTextFromCFI', () => {
  it('extracts text hint from brackets', () => {
    expect(extractTextFromCFI('epubcfi(/6/4[chap01])')).toBe('chap01');
  });

  it('returns the first bracket content when multiple exist', () => {
    expect(extractTextFromCFI('epubcfi(/6/4[first][second])')).toBe('first');
  });

  it('returns null when no brackets are present', () => {
    expect(extractTextFromCFI('epubcfi(/6/4)')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractTextFromCFI('')).toBeNull();
  });

  it('handles brackets with special characters', () => {
    expect(extractTextFromCFI('[chapter-1_intro]')).toBe('chapter-1_intro');
  });

  it('does not match empty brackets', () => {
    // (.+?) requires at least one character
    expect(extractTextFromCFI('[]')).toBeNull();
  });
});

describe('formatCFIForDisplay', () => {
  it('returns section info for a valid CFI with enough path parts', () => {
    const result = formatCFIForDisplay('epubcfi(/6/4)');
    expect(result).toBe('Section 4');
  });

  it('returns "Unknown location" for invalid CFI', () => {
    expect(formatCFIForDisplay('not-a-cfi')).toBe('Unknown location');
  });

  it('returns "Unknown location" for empty string', () => {
    expect(formatCFIForDisplay('')).toBe('Unknown location');
  });

  it('returns "EPUB location" when path has fewer than 2 parts', () => {
    // Single path component after filtering empty strings
    const result = formatCFIForDisplay('epubcfi(/6)');
    // path = '/6', split('/') = ['', '6'], filter(Boolean) = ['6'] — only 1 part
    expect(result).toBe('EPUB location');
  });

  it('uses the second path part for section display', () => {
    // path = '/2/8/14', split('/') = ['', '2', '8', '14'], filter(Boolean) = ['2', '8', '14']
    // pathParts[1] = '8'
    const result = formatCFIForDisplay('epubcfi(/2/8/14)');
    expect(result).toBe('Section 8');
  });

  it('handles CFI range by using concatenated path', () => {
    // parseCFI('epubcfi(/6/4,/1:0,/1:10)') = { path: '/6/4/1:0' }
    // split('/') = ['', '6', '4', '1:0'], filter = ['6', '4', '1:0']
    // pathParts[1] = '4'
    const result = formatCFIForDisplay('epubcfi(/6/4,/1:0,/1:10)');
    expect(result).toBe('Section 4');
  });
});
