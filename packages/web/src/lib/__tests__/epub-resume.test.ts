import { describe, expect, it } from 'vitest';
import {
  getPreferredEpubRestoreTarget,
  getProgressFromEpubLocation,
  getCfiFromProgress,
} from '../epub-location';

describe('EPUB resume flow', () => {
  it('round-trips a saved CFI across reopen', () => {
    const firstSessionLocations = {
      length: () => 100,
      percentageFromCfi: () => 0.42,
      cfiFromPercentage: (percentage: number) => `epubcfi(progress:${percentage.toFixed(2)})`,
    };
    const relocatedCfi = 'epubcfi(/6/8!/4/2/10)';

    const savedProgress = getProgressFromEpubLocation(firstSessionLocations, relocatedCfi, 41);
    expect(savedProgress).toBe(42);

    const restoreTarget = getPreferredEpubRestoreTarget(
      relocatedCfi,
      savedProgress ?? 0,
      firstSessionLocations,
      ['epubcfi(/6/2)', 'epubcfi(/6/4)', relocatedCfi]
    );

    expect(restoreTarget).toBe(relocatedCfi);
  });

  it('falls back to a progress-derived CFI when the saved CFI is unavailable', () => {
    const reopenedLocations = {
      length: () => 4,
      cfiFromPercentage: (percentage: number) => `epubcfi(progress:${percentage.toFixed(2)})`,
    };

    const fallbackTarget = getPreferredEpubRestoreTarget(
      null,
      50,
      reopenedLocations,
      ['epubcfi(/6/2)', 'epubcfi(/6/4)', 'epubcfi(/6/6)', 'epubcfi(/6/8)']
    );

    expect(fallbackTarget).toBe('epubcfi(progress:0.50)');
    expect(getCfiFromProgress(reopenedLocations, [], 50)).toBe('epubcfi(progress:0.50)');
  });
});
