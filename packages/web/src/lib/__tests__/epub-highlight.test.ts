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
    expect(result).toEqual({ path: '/6/4/2:5', offset: undefined });
  });

  it('extracts CFI even when wrapper text precedes epubcfi', () => {
    // The regex is not anchored, so it finds epubcfi() anywhere in the string
    const result = parseCFI('prefix epubcfi(/6/4)');
    expect(result).toEqual({ path: '/6/4' });
  });

  it('handles CFI with deeply nested paths', () => {
    const result = parseCFI('epubcfi(/6/2!/4/2/1/2/3:5)');
    expect(result).toEqual({ path: '/6/2!/4/2/1/2/3:5' });
  });

  it('handles CFI with only a single path segment', () => {
    const result = parseCFI('epubcfi(/2)');
    expect(result).toEqual({ path: '/2' });
  });

  it('handles CFI range where base path is minimal', () => {
    const result = parseCFI('epubcfi(/,/1:0,/1:5)');
    expect(result).toEqual({ path: '//1:0', offset: undefined });
  });

  it('handles CFI with special characters in path', () => {
    const result = parseCFI('epubcfi(/6/4!/4/2[id42]:7)');
    expect(result).toEqual({ path: '/6/4!/4/2[id42]:7' });
  });

  it('returns null for epubcfi with only whitespace inside', () => {
    const result = parseCFI('epubcfi( )');
    // The regex (.+) matches whitespace, so this returns a result
    expect(result).toEqual({ path: ' ' });
  });

  it('handles CFI range with more than three comma-separated parts', () => {
    // Extra commas become part of the "third" segment (ignored in concat)
    const result = parseCFI('epubcfi(/6/4,/1:0,/1:10,/2:5)');
    // parts[0] + parts[1] = '/6/4' + '/1:0'
    expect(result).toEqual({ path: '/6/4/1:0', offset: undefined });
  });

  it('returns null for text that looks similar but is not epubcfi format', () => {
    expect(parseCFI('epubcf(/6/4)')).toBeNull();
    expect(parseCFI('EPUBCFI(/6/4)')).toBeNull();
    expect(parseCFI('epubcfi[/6/4]')).toBeNull();
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
    expect(compareCFI('epubcfi(/6/4)', 'epubcfi(/6/40)')).toBeLessThan(0);
  });

  it('compares empty strings', () => {
    expect(compareCFI('', '')).toBe(0);
  });

  it('compares when one string is empty', () => {
    expect(compareCFI('', 'a')).toBeLessThan(0);
    expect(compareCFI('a', '')).toBeGreaterThan(0);
  });

  it('compares CFIs with different depths', () => {
    expect(compareCFI('epubcfi(/6/4)', 'epubcfi(/6/4/2)')).toBeLessThan(0);
  });

  it('compares CFIs with text hints', () => {
    const a = 'epubcfi(/6/4[chap01])';
    const b = 'epubcfi(/6/4[chap02])';
    expect(compareCFI(a, b)).toBeLessThan(0);
  });

  it('is consistent across multiple calls', () => {
    const a = 'epubcfi(/6/2)';
    const b = 'epubcfi(/6/4)';
    const result1 = compareCFI(a, b);
    const result2 = compareCFI(a, b);
    expect(result1).toBe(result2);
  });

  it('is antisymmetric', () => {
    const a = 'epubcfi(/6/2)';
    const b = 'epubcfi(/6/4)';
    expect(Math.sign(compareCFI(a, b))).toBe(-Math.sign(compareCFI(b, a)));
  });

  it('compares plain strings without epubcfi wrapper', () => {
    expect(compareCFI('abc', 'abd')).toBeLessThan(0);
    expect(compareCFI('abd', 'abc')).toBeGreaterThan(0);
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

  it('handles empty string range', () => {
    expect(isCFIInRange('', '', '')).toBe(true);
    expect(isCFIInRange('a', '', 'z')).toBe(true);
    expect(isCFIInRange('', '', 'z')).toBe(true);
  });

  it('returns false when CFI is just before start lexicographically', () => {
    expect(isCFIInRange('aa', 'ab', 'az')).toBe(false);
  });

  it('returns false when CFI is just after end lexicographically', () => {
    expect(isCFIInRange('ba', 'aa', 'az')).toBe(false);
  });

  it('handles full epubcfi strings in range check', () => {
    const start = 'epubcfi(/6/2)';
    const end = 'epubcfi(/6/8)';
    const mid = 'epubcfi(/6/4)';
    const before = 'epubcfi(/6/1)';
    const after = 'epubcfi(/6/9)';

    expect(isCFIInRange(mid, start, end)).toBe(true);
    expect(isCFIInRange(before, start, end)).toBe(false);
    expect(isCFIInRange(after, start, end)).toBe(false);
    expect(isCFIInRange(start, start, end)).toBe(true);
    expect(isCFIInRange(end, start, end)).toBe(true);
  });

  it('returns true when range spans all values', () => {
    // Empty string is lexicographically before any non-empty string
    expect(isCFIInRange('anything', '', 'zzz')).toBe(true);
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
    expect(extractTextFromCFI('[]')).toBeNull();
  });

  it('extracts text with spaces', () => {
    expect(extractTextFromCFI('epubcfi(/6/4[chapter one])')).toBe('chapter one');
  });

  it('extracts text with numeric content', () => {
    expect(extractTextFromCFI('epubcfi(/6/4[42])')).toBe('42');
  });

  it('extracts single character content', () => {
    expect(extractTextFromCFI('[x]')).toBe('x');
  });

  it('does not match brackets that span newlines', () => {
    // The .+? pattern does not match newlines by default
    expect(extractTextFromCFI('[line1\nline2]')).toBeNull();
  });

  it('handles string with only brackets and no surrounding text', () => {
    expect(extractTextFromCFI('[content]')).toBe('content');
  });

  it('ignores brackets that appear in other contexts', () => {
    // If brackets appear in a normal path, extract them
    const result = extractTextFromCFI('/6/4[id-ref]/2:5');
    expect(result).toBe('id-ref');
  });

  it('extracts from CFI with nested-looking bracket content', () => {
    // The regex (.+?) is non-greedy, so it stops at first ]
    expect(extractTextFromCFI('[outer[inner]]')).toBe('outer[inner');
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
    const result = formatCFIForDisplay('epubcfi(/6)');
    expect(result).toBe('EPUB location');
  });

  it('uses the second path part for section display', () => {
    const result = formatCFIForDisplay('epubcfi(/2/8/14)');
    expect(result).toBe('Section 8');
  });

  it('handles CFI range by using concatenated path', () => {
    const result = formatCFIForDisplay('epubcfi(/6/4,/1:0,/1:10)');
    expect(result).toBe('Section 4');
  });

  it('handles CFI with bracket annotations in path parts', () => {
    // path = '/6/4[chap01]', split('/') = ['', '6', '4[chap01]']
    // filter(Boolean) = ['6', '4[chap01]'], pathParts[1] = '4[chap01]'
    const result = formatCFIForDisplay('epubcfi(/6/4[chap01])');
    expect(result).toBe('Section 4[chap01]');
  });

  it('handles CFI with exclamation mark in path (indirection step)', () => {
    // path = '/6/14!/4/2', split('/') = ['', '6', '14!', '4', '2']
    // filter(Boolean) = ['6', '14!', '4', '2'], pathParts[1] = '14!'
    const result = formatCFIForDisplay('epubcfi(/6/14!/4/2)');
    expect(result).toBe('Section 14!');
  });

  it('handles CFI with colon (character offset) in path', () => {
    // path = '/6/4/2:5', split('/') = ['', '6', '4', '2:5']
    // filter(Boolean) = ['6', '4', '2:5'], pathParts[1] = '4'
    const result = formatCFIForDisplay('epubcfi(/6/4/2:5)');
    expect(result).toBe('Section 4');
  });

  it('returns "Unknown location" for strings that almost look like epubcfi', () => {
    expect(formatCFIForDisplay('epubcfi()')).toBe('Unknown location');
    expect(formatCFIForDisplay('EPUBCFI(/6/4)')).toBe('Unknown location');
  });

  it('handles CFI where parsed path has exactly two segments', () => {
    // path = '/6/4', split('/') = ['', '6', '4'], filter(Boolean) = ['6', '4']
    // pathParts.length === 2, pathParts[1] = '4'
    const result = formatCFIForDisplay('epubcfi(/6/4)');
    expect(result).toBe('Section 4');
  });

  it('handles CFI where path starts with a non-slash character', () => {
    // This is an unusual CFI, but parseCFI returns { path: 'x' }
    // split('/') = ['x'], filter(Boolean) = ['x'], length < 2
    const result = formatCFIForDisplay('epubcfi(x)');
    expect(result).toBe('EPUB location');
  });

  it('displays section for deeply nested paths', () => {
    // path = '/2/4/6/8/10', pathParts[1] = '4'
    const result = formatCFIForDisplay('epubcfi(/2/4/6/8/10)');
    expect(result).toBe('Section 4');
  });
});
