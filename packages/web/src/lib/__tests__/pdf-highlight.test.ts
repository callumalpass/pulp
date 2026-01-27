import { describe, it, expect } from 'vitest';
import { parseSelectionFromString, selectionToString } from '../pdf-highlight';

describe('parseSelectionFromString', () => {
  it('parses a valid selection string with four integers', () => {
    const result = parseSelectionFromString('0,5,3,10');
    expect(result).toEqual({
      beginIndex: 0,
      beginOffset: 5,
      endIndex: 3,
      endOffset: 10,
    });
  });

  it('handles whitespace around values', () => {
    const result = parseSelectionFromString(' 1 , 2 , 3 , 4 ');
    expect(result).toEqual({
      beginIndex: 1,
      beginOffset: 2,
      endIndex: 3,
      endOffset: 4,
    });
  });

  it('handles zero values', () => {
    const result = parseSelectionFromString('0,0,0,0');
    expect(result).toEqual({
      beginIndex: 0,
      beginOffset: 0,
      endIndex: 0,
      endOffset: 0,
    });
  });

  it('handles large integer values', () => {
    const result = parseSelectionFromString('100,500,200,1000');
    expect(result).toEqual({
      beginIndex: 100,
      beginOffset: 500,
      endIndex: 200,
      endOffset: 1000,
    });
  });

  it('returns null for fewer than four parts', () => {
    expect(parseSelectionFromString('1,2,3')).toBeNull();
    expect(parseSelectionFromString('1,2')).toBeNull();
    expect(parseSelectionFromString('1')).toBeNull();
  });

  it('returns null for more than four parts', () => {
    expect(parseSelectionFromString('1,2,3,4,5')).toBeNull();
  });

  it('returns null for non-numeric values', () => {
    expect(parseSelectionFromString('a,b,c,d')).toBeNull();
    expect(parseSelectionFromString('1,2,three,4')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSelectionFromString('')).toBeNull();
  });

  it('returns null when any value is NaN', () => {
    expect(parseSelectionFromString('1,NaN,3,4')).toBeNull();
    expect(parseSelectionFromString(',,,')).toBeNull();
  });

  it('handles negative integers', () => {
    // parseInt handles negative numbers
    const result = parseSelectionFromString('-1,0,5,10');
    expect(result).toEqual({
      beginIndex: -1,
      beginOffset: 0,
      endIndex: 5,
      endOffset: 10,
    });
  });
});

describe('selectionToString', () => {
  it('serializes a TextSelection to comma-separated string', () => {
    const result = selectionToString({
      beginIndex: 0,
      beginOffset: 5,
      endIndex: 3,
      endOffset: 10,
    });
    expect(result).toBe('0,5,3,10');
  });

  it('handles zero values', () => {
    const result = selectionToString({
      beginIndex: 0,
      beginOffset: 0,
      endIndex: 0,
      endOffset: 0,
    });
    expect(result).toBe('0,0,0,0');
  });

  it('handles large values', () => {
    const result = selectionToString({
      beginIndex: 999,
      beginOffset: 1234,
      endIndex: 5678,
      endOffset: 9999,
    });
    expect(result).toBe('999,1234,5678,9999');
  });

  it('roundtrips with parseSelectionFromString', () => {
    const original = {
      beginIndex: 7,
      beginOffset: 42,
      endIndex: 15,
      endOffset: 100,
    };
    const serialized = selectionToString(original);
    const parsed = parseSelectionFromString(serialized);
    expect(parsed).toEqual(original);
  });

  it('roundtrips zero selection', () => {
    const original = {
      beginIndex: 0,
      beginOffset: 0,
      endIndex: 0,
      endOffset: 0,
    };
    expect(parseSelectionFromString(selectionToString(original))).toEqual(original);
  });
});
