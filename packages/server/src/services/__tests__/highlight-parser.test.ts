import { describe, it, expect } from 'vitest';
import {
  generatePDFHighlightId,
  generateEPUBHighlightId,
  parseHighlights,
  extractHighlightContext,
  extractPageLabel,
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
