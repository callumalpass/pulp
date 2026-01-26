import { describe, it, expect } from 'vitest';
import {
  generatePDFHighlightId,
  generateEPUBHighlightId,
  parseHighlights,
  extractHighlightContext,
  extractPageLabel,
  extractTimestamp,
  extractCategory,
} from '../highlight-parser.js';

describe('generatePDFHighlightId', () => {
  it('generates a stable 10-character ID', () => {
    const selection = {
      beginIndex: 0,
      beginOffset: 10,
      endIndex: 2,
      endOffset: 25,
    };
    const id = generatePDFHighlightId(5, selection);
    expect(id).toHaveLength(10);
    expect(typeof id).toBe('string');
  });

  it('generates the same ID for the same input', () => {
    const selection = {
      beginIndex: 1,
      beginOffset: 5,
      endIndex: 3,
      endOffset: 20,
    };
    const id1 = generatePDFHighlightId(10, selection);
    const id2 = generatePDFHighlightId(10, selection);
    expect(id1).toBe(id2);
  });

  it('generates different IDs for different pages', () => {
    const selection = {
      beginIndex: 0,
      beginOffset: 0,
      endIndex: 1,
      endOffset: 10,
    };
    const id1 = generatePDFHighlightId(1, selection);
    const id2 = generatePDFHighlightId(2, selection);
    expect(id1).not.toBe(id2);
  });

  it('generates different IDs for different selections', () => {
    const selection1 = {
      beginIndex: 0,
      beginOffset: 0,
      endIndex: 1,
      endOffset: 10,
    };
    const selection2 = {
      beginIndex: 0,
      beginOffset: 0,
      endIndex: 1,
      endOffset: 11, // different endOffset
    };
    const id1 = generatePDFHighlightId(1, selection1);
    const id2 = generatePDFHighlightId(1, selection2);
    expect(id1).not.toBe(id2);
  });
});

describe('generateEPUBHighlightId', () => {
  it('generates a stable 10-character ID', () => {
    const cfi = 'epubcfi(/6/4[chap01ref]!/4/2/4)';
    const id = generateEPUBHighlightId(cfi);
    expect(id).toHaveLength(10);
    expect(typeof id).toBe('string');
  });

  it('generates the same ID for the same CFI', () => {
    const cfi = 'epubcfi(/6/4!/4/2)';
    const id1 = generateEPUBHighlightId(cfi);
    const id2 = generateEPUBHighlightId(cfi);
    expect(id1).toBe(id2);
  });

  it('generates different IDs for different CFIs', () => {
    const cfi1 = 'epubcfi(/6/4!/4/2)';
    const cfi2 = 'epubcfi(/6/4!/4/3)';
    const id1 = generateEPUBHighlightId(cfi1);
    const id2 = generateEPUBHighlightId(cfi2);
    expect(id1).not.toBe(id2);
  });
});

describe('parseHighlights', () => {
  describe('PDF highlights', () => {
    it('parses a PDF highlight with selection format', () => {
      const content = `> This is the highlighted text.
[[books/test.pdf#page=5&selection=0,10,2,25|Highlight link]]`;

      const highlights = parseHighlights(content, 'books/test.pdf');
      expect(highlights).toHaveLength(1);
      expect(highlights[0].type).toBe('pdf');
      if (highlights[0].type === 'pdf') {
        expect(highlights[0].page).toBe(5);
        expect(highlights[0].selection).toEqual({
          beginIndex: 0,
          beginOffset: 10,
          endIndex: 2,
          endOffset: 25,
        });
        expect(highlights[0].text).toBe('This is the highlighted text.');
      }
    });

    it('parses multiple PDF highlights', () => {
      const content = `> First highlight.
[[books/test.pdf#page=1&selection=0,0,1,10|First link]]

> Second highlight.
[[books/test.pdf#page=3&selection=2,5,3,15|Second link]]`;

      const highlights = parseHighlights(content, 'books/test.pdf');
      expect(highlights).toHaveLength(2);
      expect(highlights[0].type).toBe('pdf');
      expect(highlights[1].type).toBe('pdf');
      if (highlights[0].type === 'pdf' && highlights[1].type === 'pdf') {
        expect(highlights[0].page).toBe(1);
        expect(highlights[1].page).toBe(3);
      }
    });

    it('handles highlights without preceding blockquote', () => {
      const content = `[[books/test.pdf#page=5&selection=0,10,2,25|Link]]`;

      const highlights = parseHighlights(content, 'books/test.pdf');
      expect(highlights).toHaveLength(1);
      expect(highlights[0].text).toBe('Highlight'); // default fallback
    });

    it('ignores malformed selection format', () => {
      const content = `[[books/test.pdf#page=5&selection=0,10,2|Incomplete selection]]`;

      const highlights = parseHighlights(content, 'books/test.pdf');
      expect(highlights).toHaveLength(0);
    });

    it('ignores highlights from different source files', () => {
      const content = `> Highlight from other book.
[[books/other.pdf#page=5&selection=0,10,2,25|Link]]`;

      const highlights = parseHighlights(content, 'books/test.pdf');
      expect(highlights).toHaveLength(0);
    });
  });

  describe('EPUB highlights', () => {
    it('parses an EPUB highlight with CFI', () => {
      const content = `> This is the EPUB highlight.
[[books/test.epub#cfi=epubcfi(/6/4!/4/2)|Highlight link]]`;

      const highlights = parseHighlights(content, 'books/test.epub');
      expect(highlights).toHaveLength(1);
      expect(highlights[0].type).toBe('epub');
      if (highlights[0].type === 'epub') {
        expect(highlights[0].cfi).toBe('epubcfi(/6/4!/4/2)');
        expect(highlights[0].text).toBe('This is the EPUB highlight.');
      }
    });

    it('parses multiple EPUB highlights', () => {
      const content = `> First EPUB highlight.
[[books/test.epub#cfi=epubcfi(/6/2)|First]]

> Second EPUB highlight.
[[books/test.epub#cfi=epubcfi(/6/4)|Second]]`;

      const highlights = parseHighlights(content, 'books/test.epub');
      expect(highlights).toHaveLength(2);
    });

    it('ignores EPUB highlights from different source files', () => {
      const content = `> Highlight from other book.
[[books/other.epub#cfi=epubcfi(/6/4)|Link]]`;

      const highlights = parseHighlights(content, 'books/test.epub');
      expect(highlights).toHaveLength(0);
    });
  });

  describe('pageLabel extraction', () => {
    it('extracts pageLabel from PDF highlight link', () => {
      const content = `> This is the highlighted text.
[[books/test.pdf#page=5&selection=0,10,2,25|p. iv]]`;

      const highlights = parseHighlights(content, 'books/test.pdf');
      expect(highlights).toHaveLength(1);
      expect(highlights[0].type).toBe('pdf');
      if (highlights[0].type === 'pdf') {
        expect(highlights[0].page).toBe(5);
        expect(highlights[0].pageLabel).toBe('iv');
      }
    });

    it('extracts pageLabel from highlight with quoted text', () => {
      const content = `> Quote text.
[[books/test.pdf#page=10&selection=0,0,1,10|"Quote text"|p. xii]]`;

      const highlights = parseHighlights(content, 'books/test.pdf');
      expect(highlights).toHaveLength(1);
      if (highlights[0].type === 'pdf') {
        expect(highlights[0].pageLabel).toBe('xii');
      }
    });

    it('does not set pageLabel when it matches physical page', () => {
      const content = `> Quote text.
[[books/test.pdf#page=42&selection=0,0,1,10|p. 42]]`;

      const highlights = parseHighlights(content, 'books/test.pdf');
      expect(highlights).toHaveLength(1);
      if (highlights[0].type === 'pdf') {
        expect(highlights[0].pageLabel).toBeUndefined();
      }
    });

    it('handles complex page labels', () => {
      const content = `> Quote text.
[[books/test.pdf#page=5&selection=0,0,1,10|p. A-3]]`;

      const highlights = parseHighlights(content, 'books/test.pdf');
      expect(highlights).toHaveLength(1);
      if (highlights[0].type === 'pdf') {
        expect(highlights[0].pageLabel).toBe('A-3');
      }
    });
  });

  describe('special characters in source path', () => {
    it('handles source paths with parentheses', () => {
      const content = `> Highlighted text.
[[books/Book (2024).pdf#page=1&selection=0,0,1,5|Link]]`;

      const highlights = parseHighlights(content, 'books/Book (2024).pdf');
      expect(highlights).toHaveLength(1);
    });

    it('handles source paths with brackets', () => {
      const content = `> Highlighted text.
[[books/[Draft] Book.pdf#page=1&selection=0,0,1,5|Link]]`;

      const highlights = parseHighlights(content, 'books/[Draft] Book.pdf');
      expect(highlights).toHaveLength(1);
    });

    it('handles source paths with plus signs', () => {
      const content = `> Highlighted text.
[[books/C++ Programming.pdf#page=1&selection=0,0,1,5|Link]]`;

      const highlights = parseHighlights(content, 'books/C++ Programming.pdf');
      expect(highlights).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty content', () => {
      const highlights = parseHighlights('', 'books/test.pdf');
      expect(highlights).toEqual([]);
    });

    it('returns empty array for content without highlights', () => {
      const content = `# My Notes

Just some regular text without any highlights.`;

      const highlights = parseHighlights(content, 'books/test.pdf');
      expect(highlights).toEqual([]);
    });

    it('assigns unique IDs to each highlight', () => {
      const content = `> First.
[[books/test.pdf#page=1&selection=0,0,1,10|First]]

> Second.
[[books/test.pdf#page=1&selection=1,0,2,10|Second]]`;

      const highlights = parseHighlights(content, 'books/test.pdf');
      expect(highlights).toHaveLength(2);
      expect(highlights[0].id).not.toBe(highlights[1].id);
    });

    it('includes createdAt timestamp', () => {
      const content = `> Highlight text.
[[books/test.pdf#page=1&selection=0,0,1,10|Link]]`;

      const highlights = parseHighlights(content, 'books/test.pdf');
      expect(highlights[0].createdAt).toBeDefined();
      expect(() => new Date(highlights[0].createdAt)).not.toThrow();
    });
  });

  describe('timestamp extraction', () => {
    it('extracts timestamp from PDF highlight link', () => {
      const content = `> Highlighted text.
[[books/test.pdf#page=5&selection=0,10,2,25|"text"|p. 5|2024-03-15]]`;

      const highlights = parseHighlights(content, 'books/test.pdf');
      expect(highlights).toHaveLength(1);
      expect(highlights[0].createdAt).toBe('2024-03-15T00:00:00.000Z');
    });

    it('extracts timestamp from EPUB highlight link', () => {
      const content = `> EPUB highlight.
[[books/test.epub#cfi=epubcfi(/6/4)|"text"|2024-07-22]]`;

      const highlights = parseHighlights(content, 'books/test.epub');
      expect(highlights).toHaveLength(1);
      expect(highlights[0].createdAt).toBe('2024-07-22T00:00:00.000Z');
    });

    it('uses current date when no timestamp in link', () => {
      const before = new Date();
      const content = `> Highlight without timestamp.
[[books/test.pdf#page=1&selection=0,0,1,10|"text"]]`;

      const highlights = parseHighlights(content, 'books/test.pdf');
      const after = new Date();
      const createdAt = new Date(highlights[0].createdAt);

      expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('preserves both pageLabel and timestamp when both present', () => {
      const content = `> Quote text.
[[books/test.pdf#page=10&selection=0,0,1,10|"text"|p. iv|2024-01-20]]`;

      const highlights = parseHighlights(content, 'books/test.pdf');
      expect(highlights).toHaveLength(1);
      if (highlights[0].type === 'pdf') {
        expect(highlights[0].pageLabel).toBe('iv');
        expect(highlights[0].createdAt).toBe('2024-01-20T00:00:00.000Z');
      }
    });
  });
});

describe('extractPageLabel', () => {
  it('extracts page label with "p. " prefix', () => {
    const linkText = '[[books/test.pdf#page=5&selection=0,0,1,10|p. iv]]';
    expect(extractPageLabel(linkText, 5)).toBe('iv');
  });

  it('extracts page label with "p." prefix (no space)', () => {
    const linkText = '[[books/test.pdf#page=5&selection=0,0,1,10|p.iv]]';
    expect(extractPageLabel(linkText, 5)).toBe('iv');
  });

  it('extracts page label with "page" prefix', () => {
    const linkText = '[[books/test.pdf#page=10&selection=0,0,1,10|page xii]]';
    expect(extractPageLabel(linkText, 10)).toBe('xii');
  });

  it('extracts page label after quoted text', () => {
    const linkText = '[[books/test.pdf#page=5&selection=0,0,1,10|"Some quote"|p. iv]]';
    expect(extractPageLabel(linkText, 5)).toBe('iv');
  });

  it('returns undefined when page label matches physical page', () => {
    const linkText = '[[books/test.pdf#page=42&selection=0,0,1,10|p. 42]]';
    expect(extractPageLabel(linkText, 42)).toBeUndefined();
  });

  it('returns undefined when no page label pattern found', () => {
    const linkText = '[[books/test.pdf#page=5&selection=0,0,1,10|"Just a quote"]]';
    expect(extractPageLabel(linkText, 5)).toBeUndefined();
  });

  it('handles complex page labels like "A-3"', () => {
    const linkText = '[[books/test.pdf#page=5&selection=0,0,1,10|p. A-3]]';
    expect(extractPageLabel(linkText, 5)).toBe('A-3');
  });

  it('is case insensitive for prefix', () => {
    const linkText = '[[books/test.pdf#page=5&selection=0,0,1,10|P. iv]]';
    expect(extractPageLabel(linkText, 5)).toBe('iv');
  });

  it('extracts page label when followed by timestamp', () => {
    const linkText = '[[books/test.pdf#page=5&selection=0,0,1,10|"quote"|p. iv|2024-01-15]]';
    expect(extractPageLabel(linkText, 5)).toBe('iv');
  });

  it('extracts page label when timestamp follows without quote', () => {
    const linkText = '[[books/test.pdf#page=5&selection=0,0,1,10|p. xii|2024-06-20]]';
    expect(extractPageLabel(linkText, 5)).toBe('xii');
  });
});

describe('extractTimestamp', () => {
  it('extracts timestamp from link ending with date', () => {
    const linkText = '[[books/test.pdf#page=5&selection=0,0,1,10|"quote"|2024-01-15]]';
    const timestamp = extractTimestamp(linkText);
    expect(timestamp).toBe('2024-01-15T00:00:00.000Z');
  });

  it('extracts timestamp with page label before date', () => {
    const linkText = '[[books/test.pdf#page=5&selection=0,0,1,10|"quote"|p. 42|2024-06-20]]';
    const timestamp = extractTimestamp(linkText);
    expect(timestamp).toBe('2024-06-20T00:00:00.000Z');
  });

  it('extracts timestamp for EPUB highlights', () => {
    const linkText = '[[books/test.epub#cfi=epubcfi(/6/4)|"text"|2023-12-25]]';
    const timestamp = extractTimestamp(linkText);
    expect(timestamp).toBe('2023-12-25T00:00:00.000Z');
  });

  it('returns undefined when no timestamp present', () => {
    const linkText = '[[books/test.pdf#page=5&selection=0,0,1,10|"quote"]]';
    expect(extractTimestamp(linkText)).toBeUndefined();
  });

  it('returns undefined for invalid date format', () => {
    const linkText = '[[books/test.pdf#page=5&selection=0,0,1,10|"quote"|01-15-2024]]';
    expect(extractTimestamp(linkText)).toBeUndefined();
  });

  it('returns undefined for partial date', () => {
    const linkText = '[[books/test.pdf#page=5&selection=0,0,1,10|"quote"|2024-01]]';
    expect(extractTimestamp(linkText)).toBeUndefined();
  });

  it('handles dates at year boundary', () => {
    const linkText = '[[books/test.pdf#page=1&selection=0,0,1,10|text|2024-12-31]]';
    const timestamp = extractTimestamp(linkText);
    expect(timestamp).toBe('2024-12-31T00:00:00.000Z');
  });
});

describe('extractCategory', () => {
  it('extracts category from PDF highlight link', () => {
    const linkText = '[[books/test.pdf#page=5&selection=0,10,2,25&category=important|"text"]]';
    expect(extractCategory(linkText)).toBe('important');
  });

  it('extracts category from EPUB highlight link', () => {
    const linkText = '[[books/test.epub#cfi=epubcfi(/6/4)&category=question|"text"]]';
    expect(extractCategory(linkText)).toBe('question');
  });

  it('returns undefined when no category present', () => {
    const linkText = '[[books/test.pdf#page=5&selection=0,10,2,25|"text"]]';
    expect(extractCategory(linkText)).toBeUndefined();
  });

  it('returns undefined for invalid category', () => {
    const linkText = '[[books/test.pdf#page=5&selection=0,10,2,25&category=invalid|"text"]]';
    expect(extractCategory(linkText)).toBeUndefined();
  });

  it('extracts all valid categories', () => {
    const categories = ['highlight', 'important', 'question', 'todo', 'definition'];
    for (const cat of categories) {
      const linkText = `[[books/test.pdf#page=1&selection=0,0,1,1&category=${cat}|text]]`;
      expect(extractCategory(linkText)).toBe(cat);
    }
  });
});

describe('parseHighlights with categories', () => {
  it('parses PDF highlight with category', () => {
    const content = `> Important text.
[[books/test.pdf#page=5&selection=0,10,2,25&category=important|"text"|p. 5]]`;

    const highlights = parseHighlights(content, 'books/test.pdf');
    expect(highlights).toHaveLength(1);
    expect(highlights[0].type).toBe('pdf');
    if (highlights[0].type === 'pdf') {
      expect(highlights[0].category).toBe('important');
    }
  });

  it('parses EPUB highlight with category', () => {
    const content = `> Question to research.
[[books/test.epub#cfi=epubcfi(/6/4)&category=question|"text"]]`;

    const highlights = parseHighlights(content, 'books/test.epub');
    expect(highlights).toHaveLength(1);
    expect(highlights[0].type).toBe('epub');
    if (highlights[0].type === 'epub') {
      expect(highlights[0].category).toBe('question');
    }
  });

  it('does not set category when not present', () => {
    const content = `> Regular highlight.
[[books/test.pdf#page=1&selection=0,0,1,10|"text"]]`;

    const highlights = parseHighlights(content, 'books/test.pdf');
    expect(highlights).toHaveLength(1);
    expect(highlights[0].category).toBeUndefined();
  });

  it('parses highlights with all metadata: category, pageLabel, and timestamp', () => {
    const content = `> Definition of a key term.
[[books/test.pdf#page=10&selection=0,5,2,20&category=definition|"text"|p. iv|2024-06-15]]`;

    const highlights = parseHighlights(content, 'books/test.pdf');
    expect(highlights).toHaveLength(1);
    if (highlights[0].type === 'pdf') {
      expect(highlights[0].category).toBe('definition');
      expect(highlights[0].pageLabel).toBe('iv');
      expect(highlights[0].createdAt).toBe('2024-06-15T00:00:00.000Z');
    }
  });
});

describe('extractHighlightContext', () => {
  describe('text extraction from blockquotes', () => {
    it('extracts text from a single-line blockquote', () => {
      const content = `> This is quoted text.
[[link]]`;
      const linkIndex = content.indexOf('[[link]]');
      const { text } = extractHighlightContext(content, linkIndex);
      expect(text).toBe('This is quoted text.');
    });

    it('extracts text from a multi-line blockquote', () => {
      const content = `> Line one.
> Line two.
> Line three.
[[link]]`;
      const linkIndex = content.indexOf('[[link]]');
      const { text } = extractHighlightContext(content, linkIndex);
      expect(text).toBe('Line one.\nLine two.\nLine three.');
    });

    it('returns undefined when no blockquote precedes the link', () => {
      const content = `Regular paragraph.
[[link]]`;
      const linkIndex = content.indexOf('[[link]]');
      const { text } = extractHighlightContext(content, linkIndex);
      expect(text).toBeUndefined();
    });

    it('stops at an empty line before the blockquote', () => {
      const content = `> First quote.

> Second quote.
[[link]]`;
      const linkIndex = content.indexOf('[[link]]');
      const { text } = extractHighlightContext(content, linkIndex);
      expect(text).toBe('Second quote.');
    });

    it('removes wikilinks from quoted text', () => {
      const content = `> Some text with [[a link]] inside.
[[main link]]`;
      const linkIndex = content.indexOf('[[main link]]');
      const { text } = extractHighlightContext(content, linkIndex);
      expect(text).toBe('Some text with  inside.');
    });
  });

  describe('note extraction', () => {
    it('extracts note text after the link', () => {
      const content = `> Quoted text.
[[link]]
This is my note about the highlight.`;
      const linkIndex = content.indexOf('[[link]]');
      const { note } = extractHighlightContext(content, linkIndex);
      expect(note).toBe('This is my note about the highlight.');
    });

    it('returns undefined when no note follows', () => {
      const content = `> Quoted text.
[[link]]`;
      const linkIndex = content.indexOf('[[link]]');
      const { note } = extractHighlightContext(content, linkIndex);
      expect(note).toBeUndefined();
    });

    it('skips empty lines before the note', () => {
      const content = `> Quoted text.
[[link]]

This is the note.`;
      const linkIndex = content.indexOf('[[link]]');
      const { note } = extractHighlightContext(content, linkIndex);
      expect(note).toBe('This is the note.');
    });

    it('stops at the next blockquote', () => {
      const content = `> First quote.
[[link1]]
Note for first.
> Second quote.
[[link2]]`;
      const linkIndex = content.indexOf('[[link1]]');
      const { note } = extractHighlightContext(content, linkIndex);
      expect(note).toBe('Note for first.');
    });

    it('stops at the next heading', () => {
      const content = `> Quote.
[[link]]
Note text.
# Next Section`;
      const linkIndex = content.indexOf('[[link]]');
      const { note } = extractHighlightContext(content, linkIndex);
      expect(note).toBe('Note text.');
    });

    it('stops at list items', () => {
      const content = `> Quote.
[[link]]
Note text.
- List item`;
      const linkIndex = content.indexOf('[[link]]');
      const { note } = extractHighlightContext(content, linkIndex);
      expect(note).toBe('Note text.');
    });
  });

  describe('edge cases', () => {
    it('handles content with link at the very start', () => {
      const content = `[[link]]
Note text.`;
      const linkIndex = 0;
      const { text, note } = extractHighlightContext(content, linkIndex);
      expect(text).toBeUndefined();
      expect(note).toBe('Note text.');
    });

    it('handles deeply nested content', () => {
      const longPrefix = 'x'.repeat(3000);
      const content = `${longPrefix}
> Quoted text.
[[link]]`;
      const linkIndex = content.indexOf('[[link]]');
      const { text } = extractHighlightContext(content, linkIndex);
      // Should still find the blockquote within the 2000 character lookback window
      expect(text).toBe('Quoted text.');
    });

    it('handles link with text on the same line in blockquote', () => {
      const content = `> Text before [[inline link]] text after.
[[main link]]`;
      const linkIndex = content.indexOf('[[main link]]');
      const { text } = extractHighlightContext(content, linkIndex);
      // The inline link should be removed
      expect(text).toBe('Text before  text after.');
    });
  });
});
