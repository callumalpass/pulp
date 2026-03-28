import { describe, expect, it } from 'vitest';
import {
  createEpubLocationsCacheKey,
  getCfiFromProgress,
  getProgressFromEpubLocation,
} from '../epub-location';

describe('createEpubLocationsCacheKey', () => {
  it('includes layout-affecting values in the cache key', () => {
    const key = createEpubLocationsCacheKey({
      noteId: 'note-1',
      sourceRelative: 'books/test.epub',
      fontSize: 18,
      lineHeight: 1.6,
      width: 823,
      height: 611,
    });

    expect(key).toContain('epub-locations-v2');
    expect(key).toContain('note-1');
    expect(key).toContain('books/test.epub');
    expect(key).toContain('fs18');
    expect(key).toContain('lh1.6');
    expect(key).toContain('800x600');
  });

  it('changes when font size changes', () => {
    const base = createEpubLocationsCacheKey({
      noteId: 'note-1',
      sourceRelative: 'books/test.epub',
      fontSize: 18,
      lineHeight: 1.6,
      width: 800,
      height: 600,
    });
    const changed = createEpubLocationsCacheKey({
      noteId: 'note-1',
      sourceRelative: 'books/test.epub',
      fontSize: 20,
      lineHeight: 1.6,
      width: 800,
      height: 600,
    });

    expect(changed).not.toBe(base);
  });
});

describe('getProgressFromEpubLocation', () => {
  it('prefers percentage derived from CFI when available', () => {
    const progress = getProgressFromEpubLocation({
      length: () => 100,
      percentageFromCfi: () => 0.42,
    }, 'epubcfi(/6/4)', 10);

    expect(progress).toBe(42);
  });

  it('falls back to location index when CFI percentages are unavailable', () => {
    const progress = getProgressFromEpubLocation({
      length: () => 20,
    }, null, 9);

    expect(progress).toBe(50);
  });
});

describe('getCfiFromProgress', () => {
  it('uses cfiFromPercentage when available', () => {
    const cfi = getCfiFromProgress({
      length: () => 10,
      cfiFromPercentage: (percentage) => `cfi:${percentage.toFixed(2)}`,
    }, ['a', 'b', 'c'], 25);

    expect(cfi).toBe('cfi:0.25');
  });

  it('falls back to cached locations when cfiFromPercentage is unavailable', () => {
    const cfi = getCfiFromProgress({
      length: () => 3,
    }, ['a', 'b', 'c'], 100);

    expect(cfi).toBe('c');
  });
});
