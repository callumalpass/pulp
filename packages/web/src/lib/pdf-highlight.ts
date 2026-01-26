// PDF++ style selection utilities
// Selection is now based on text layer node indices, not visual rects

import type { TextSelection } from '@pulp/shared';

/**
 * Parse a selection string in PDF++ format: "beginIndex,beginOffset,endIndex,endOffset"
 */
export function parseSelectionFromString(str: string): TextSelection | null {
  const parts = str.split(',').map((s) => parseInt(s.trim(), 10));

  if (parts.length !== 4 || parts.some(isNaN)) {
    return null;
  }

  return {
    beginIndex: parts[0],
    beginOffset: parts[1],
    endIndex: parts[2],
    endOffset: parts[3],
  };
}

/**
 * Convert a TextSelection to a string for URL parameters
 */
export function selectionToString(selection: TextSelection): string {
  return `${selection.beginIndex},${selection.beginOffset},${selection.endIndex},${selection.endOffset}`;
}
