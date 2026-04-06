import { describe, expect, it } from 'vitest';
import { resolvePageNavigationTarget } from './ReaderControls';

describe('resolvePageNavigationTarget', () => {
  it('prefers an exact page-label match over a physical page number', () => {
    expect(resolvePageNavigationTarget('1', 20, ['i', 'ii', '1', '2'])).toBe(3);
  });

  it('matches page labels case-insensitively', () => {
    expect(resolvePageNavigationTarget('iv', 20, ['I', 'II', 'III', 'IV'])).toBe(4);
  });

  it('falls back to a physical page number when labels do not match', () => {
    expect(resolvePageNavigationTarget('12', 20, ['i', 'ii', 'iii'])).toBe(12);
  });

  it('rejects partial numeric input', () => {
    expect(resolvePageNavigationTarget('12abc', 20, null)).toBeNull();
  });

  it('rejects out-of-range page numbers', () => {
    expect(resolvePageNavigationTarget('21', 20, null)).toBeNull();
  });
});
