import { describe, it, expect } from 'vitest';
import { sanitizeUrl, processInlineMarkdown, markdownToHtml } from '../markdown';

describe('sanitizeUrl', () => {
  it('allows normal http URLs', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('allows normal https URLs', () => {
    expect(sanitizeUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
  });

  it('allows relative URLs', () => {
    expect(sanitizeUrl('/path/to/page')).toBe('/path/to/page');
  });

  it('allows anchor-only URLs', () => {
    expect(sanitizeUrl('#section')).toBe('#section');
  });

  it('allows mailto URLs', () => {
    expect(sanitizeUrl('mailto:user@example.com')).toBe('mailto:user@example.com');
  });

  it('blocks javascript: protocol', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('#blocked');
  });

  it('blocks javascript: with mixed case', () => {
    expect(sanitizeUrl('JavaScript:alert(1)')).toBe('#blocked');
  });

  it('blocks javascript: with leading whitespace', () => {
    expect(sanitizeUrl('  javascript:alert(1)')).toBe('#blocked');
  });

  it('blocks data: protocol', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('#blocked');
  });

  it('blocks data: with mixed case', () => {
    expect(sanitizeUrl('DATA:text/html,payload')).toBe('#blocked');
  });

  it('blocks vbscript: protocol', () => {
    expect(sanitizeUrl('vbscript:msgbox("xss")')).toBe('#blocked');
  });

  it('blocks vbscript: with mixed case', () => {
    expect(sanitizeUrl('VBScript:exec')).toBe('#blocked');
  });

  it('preserves original URL casing for safe URLs', () => {
    expect(sanitizeUrl('https://Example.COM/Path')).toBe('https://Example.COM/Path');
  });

  it('handles empty string', () => {
    expect(sanitizeUrl('')).toBe('');
  });
});

describe('processInlineMarkdown', () => {
  describe('bold', () => {
    it('converts **text** to strong', () => {
      expect(processInlineMarkdown('**bold**')).toBe('<strong>bold</strong>');
    });

    it('converts __text__ to strong', () => {
      expect(processInlineMarkdown('__bold__')).toBe('<strong>bold</strong>');
    });

    it('handles bold in middle of text', () => {
      expect(processInlineMarkdown('before **bold** after')).toBe('before <strong>bold</strong> after');
    });
  });

  describe('italic', () => {
    it('converts *text* to em', () => {
      expect(processInlineMarkdown('*italic*')).toBe('<em>italic</em>');
    });

    it('converts _text_ to em', () => {
      expect(processInlineMarkdown('_italic_')).toBe('<em>italic</em>');
    });
  });

  describe('bold and italic combined', () => {
    it('converts ***text*** to strong+em', () => {
      expect(processInlineMarkdown('***both***')).toBe('<strong><em>both</em></strong>');
    });

    it('converts ___text___ to strong+em', () => {
      expect(processInlineMarkdown('___both___')).toBe('<strong><em>both</em></strong>');
    });
  });

  describe('strikethrough', () => {
    it('converts ~~text~~ to del', () => {
      expect(processInlineMarkdown('~~deleted~~')).toBe('<del>deleted</del>');
    });
  });

  describe('inline code', () => {
    it('converts `code` to code element', () => {
      expect(processInlineMarkdown('`console.log()`')).toBe('<code>console.log()</code>');
    });

    it('handles code in middle of text', () => {
      expect(processInlineMarkdown('use `npm install` here')).toBe('use <code>npm install</code> here');
    });
  });

  describe('links', () => {
    it('converts [text](url) to anchor tag', () => {
      expect(processInlineMarkdown('[click](https://example.com)')).toBe(
        '<a href="https://example.com" target="_blank" rel="noopener noreferrer">click</a>'
      );
    });

    it('sanitizes javascript: URLs in links', () => {
      // The regex [^)]+ stops at the first ) inside alert(1), leaving a trailing )
      const result = processInlineMarkdown('[xss](javascript:alert(1))');
      expect(result).toContain('href="#blocked"');
      expect(result).not.toContain('javascript:');
    });

    it('sanitizes javascript: URL without parens in payload', () => {
      expect(processInlineMarkdown('[xss](javascript:void)')).toBe(
        '<a href="#blocked" target="_blank" rel="noopener noreferrer">xss</a>'
      );
    });
  });

  describe('images', () => {
    it('converts ![alt](url) to img tag', () => {
      expect(processInlineMarkdown('![photo](https://example.com/img.png)')).toBe(
        '<img src="https://example.com/img.png" alt="photo" />'
      );
    });

    it('handles empty alt text', () => {
      expect(processInlineMarkdown('![](https://example.com/img.png)')).toBe(
        '<img src="https://example.com/img.png" alt="" />'
      );
    });

    it('sanitizes javascript: URLs in images', () => {
      // The regex [^)]+ stops at the first ) inside alert(1), leaving trailing )
      const result = processInlineMarkdown('![img](javascript:alert(1))');
      expect(result).toContain('src="#blocked"');
      expect(result).not.toContain('javascript:');
    });

    it('sanitizes javascript: URL in image without parens', () => {
      expect(processInlineMarkdown('![img](javascript:void)')).toBe(
        '<img src="#blocked" alt="img" />'
      );
    });
  });

  describe('mixed inline formatting', () => {
    it('handles bold and italic in same line', () => {
      const result = processInlineMarkdown('**bold** and *italic*');
      expect(result).toBe('<strong>bold</strong> and <em>italic</em>');
    });

    it('handles code and bold in same line', () => {
      const result = processInlineMarkdown('**important**: use `code`');
      expect(result).toBe('<strong>important</strong>: use <code>code</code>');
    });
  });

  describe('image and link coexistence', () => {
    it('processes image without also matching as link', () => {
      // Regression: ![alt](url) contains [alt](url), which would match the link regex
      // if images are not processed first
      const result = processInlineMarkdown('![photo](https://example.com/img.png)');
      expect(result).toBe('<img src="https://example.com/img.png" alt="photo" />');
      expect(result).not.toContain('<a ');
    });

    it('handles image followed by link on same line', () => {
      const result = processInlineMarkdown('![photo](https://example.com/img.png) and [click](https://example.com)');
      expect(result).toContain('<img src="https://example.com/img.png" alt="photo" />');
      expect(result).toContain('<a href="https://example.com"');
      expect(result).toContain('>click</a>');
    });

    it('handles link followed by image on same line', () => {
      const result = processInlineMarkdown('[click](https://example.com) then ![photo](https://example.com/img.png)');
      expect(result).toContain('<a href="https://example.com"');
      expect(result).toContain('<img src="https://example.com/img.png" alt="photo" />');
    });

    it('handles multiple images on same line', () => {
      const result = processInlineMarkdown('![a](https://a.png) ![b](https://b.png)');
      expect(result).toContain('<img src="https://a.png" alt="a" />');
      expect(result).toContain('<img src="https://b.png" alt="b" />');
      expect(result).not.toContain('<a ');
    });

    it('handles image with link-like alt text', () => {
      const result = processInlineMarkdown('![see [here]](https://example.com/img.png)');
      // The regex may not capture bracket-containing alt text perfectly,
      // but it should not produce a bare <a> tag from the image
      expect(result).not.toContain('href="https://example.com/img.png"');
    });
  });

  it('returns plain text unchanged', () => {
    expect(processInlineMarkdown('just plain text')).toBe('just plain text');
  });

  it('handles empty string', () => {
    expect(processInlineMarkdown('')).toBe('');
  });
});

describe('markdownToHtml', () => {
  describe('headings', () => {
    it('converts # to h1', () => {
      expect(markdownToHtml('# Title')).toContain('<h1>Title</h1>');
    });

    it('converts ## to h2', () => {
      expect(markdownToHtml('## Subtitle')).toContain('<h2>Subtitle</h2>');
    });

    it('converts ### to h3', () => {
      expect(markdownToHtml('### Section')).toContain('<h3>Section</h3>');
    });

    it('does not wrap headings in paragraph tags', () => {
      const result = markdownToHtml('# Title');
      expect(result).not.toContain('<p><h1>');
      expect(result).not.toContain('</h1></p>');
    });

    it('applies inline formatting inside headings', () => {
      expect(markdownToHtml('# **Bold** Title')).toContain('<h1><strong>Bold</strong> Title</h1>');
    });
  });

  describe('paragraphs', () => {
    it('wraps text in paragraph tags', () => {
      expect(markdownToHtml('Hello world')).toBe('<p>Hello world</p>');
    });

    it('creates separate paragraphs from double newlines', () => {
      const result = markdownToHtml('First paragraph\n\nSecond paragraph');
      expect(result).toContain('First paragraph</p><p>Second paragraph');
    });

    it('converts single newline to br', () => {
      const result = markdownToHtml('Line one\nLine two');
      expect(result).toContain('Line one<br />Line two');
    });
  });

  describe('unordered lists', () => {
    it('converts - items to ul/li', () => {
      const result = markdownToHtml('- item one\n- item two');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>item one</li>');
      expect(result).toContain('<li>item two</li>');
      expect(result).toContain('</ul>');
    });

    it('converts * items to ul/li', () => {
      const result = markdownToHtml('* first\n* second');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>first</li>');
      expect(result).toContain('<li>second</li>');
    });

    it('converts + items to ul/li', () => {
      const result = markdownToHtml('+ alpha\n+ beta');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>alpha</li>');
      expect(result).toContain('<li>beta</li>');
    });

    it('does not wrap ul in paragraph tags', () => {
      const result = markdownToHtml('- item');
      expect(result).not.toContain('<p><ul>');
      expect(result).not.toContain('</ul></p>');
    });
  });

  describe('ordered lists', () => {
    it('converts numbered items to ol/li', () => {
      const result = markdownToHtml('1. first\n2. second\n3. third');
      expect(result).toContain('<ol>');
      expect(result).toContain('<li>first</li>');
      expect(result).toContain('<li>second</li>');
      expect(result).toContain('<li>third</li>');
      expect(result).toContain('</ol>');
    });

    it('does not wrap ol in paragraph tags', () => {
      const result = markdownToHtml('1. item');
      expect(result).not.toContain('<p><ol>');
      expect(result).not.toContain('</ol></p>');
    });
  });

  describe('list transitions', () => {
    it('closes ul when switching to ol', () => {
      const result = markdownToHtml('- bullet\n1. number');
      expect(result).toContain('</ul>');
      expect(result).toContain('<ol>');
    });

    it('closes ol when switching to ul', () => {
      const result = markdownToHtml('1. number\n- bullet');
      expect(result).toContain('</ol>');
      expect(result).toContain('<ul>');
    });

    it('closes list at end of input', () => {
      const result = markdownToHtml('- last item');
      expect(result).toContain('</ul>');
    });
  });

  describe('blockquotes', () => {
    it('converts > text to blockquote', () => {
      const result = markdownToHtml('> quoted text');
      expect(result).toContain('<blockquote>quoted text</blockquote>');
    });

    it('does not wrap blockquote in paragraph tags', () => {
      const result = markdownToHtml('> quote');
      expect(result).not.toContain('<p><blockquote>');
      expect(result).not.toContain('</blockquote></p>');
    });

    it('merges consecutive blockquotes', () => {
      const result = markdownToHtml('> line one\n> line two');
      expect(result).not.toContain('</blockquote><br /><blockquote>');
    });
  });

  describe('horizontal rules', () => {
    it('converts --- to hr', () => {
      const result = markdownToHtml('---');
      expect(result).toContain('<hr />');
    });

    it('does not wrap hr in paragraph tags', () => {
      const result = markdownToHtml('---');
      expect(result).not.toContain('<p><hr />');
      expect(result).not.toContain('<hr /></p>');
    });
  });

  describe('code blocks', () => {
    it('converts fenced code blocks to pre/code', () => {
      const result = markdownToHtml('```js\nconsole.log("hi");\n```');
      expect(result).toContain('<pre><code class="language-js">');
      expect(result).toContain('console.log(&quot;hi&quot;);');
      expect(result).toContain('</code></pre>');
    });

    it('handles code blocks without language specifier', () => {
      const result = markdownToHtml('```\nplain code\n```');
      expect(result).toContain('<pre><code class="language-">');
      expect(result).toContain('plain code');
    });

    it('does not wrap pre in paragraph tags', () => {
      const result = markdownToHtml('```\ncode\n```');
      expect(result).not.toContain('<p><pre>');
      expect(result).not.toContain('</pre></p>');
    });
  });

  describe('XSS prevention', () => {
    it('escapes HTML tags in content', () => {
      const result = markdownToHtml('<script>alert("xss")</script>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('escapes ampersands', () => {
      const result = markdownToHtml('a & b');
      expect(result).toContain('a &amp; b');
    });

    it('escapes double quotes', () => {
      const result = markdownToHtml('say "hello"');
      expect(result).toContain('say &quot;hello&quot;');
    });

    it('escapes angle brackets in inline content', () => {
      const result = markdownToHtml('use <div> element');
      expect(result).toContain('&lt;div&gt;');
    });

    it('blocks javascript: URLs in markdown links', () => {
      const result = markdownToHtml('[click](javascript:alert(1))');
      expect(result).toContain('href="#blocked"');
      expect(result).not.toContain('javascript:');
    });

    it('blocks javascript: URLs in markdown images', () => {
      const result = markdownToHtml('![img](javascript:void)');
      expect(result).toContain('src="#blocked"');
      expect(result).not.toContain('javascript:');
    });

    it('blocks data: URLs in links', () => {
      const result = markdownToHtml('[click](data:text/html,<script>alert(1)</script>)');
      expect(result).toContain('href="#blocked"');
    });
  });

  describe('inline formatting within blocks', () => {
    it('applies bold inside list items', () => {
      const result = markdownToHtml('- **important** item');
      expect(result).toContain('<li><strong>important</strong> item</li>');
    });

    it('applies inline code inside headings', () => {
      const result = markdownToHtml('## Use `npm`');
      expect(result).toContain('<h2>Use <code>npm</code></h2>');
    });

    it('applies links inside blockquotes', () => {
      const result = markdownToHtml('> See [link](https://example.com)');
      expect(result).toContain('<blockquote>See <a href="https://example.com"');
    });
  });

  describe('images in full document context', () => {
    it('renders image in paragraph', () => {
      const result = markdownToHtml('Here is an image: ![photo](https://example.com/img.png)');
      expect(result).toContain('<img src="https://example.com/img.png" alt="photo" />');
      expect(result).not.toContain('href="https://example.com/img.png"');
    });

    it('renders image alongside link in same paragraph', () => {
      const result = markdownToHtml('![logo](https://logo.png) Visit [site](https://example.com)');
      expect(result).toContain('<img src="https://logo.png" alt="logo" />');
      expect(result).toContain('<a href="https://example.com"');
    });

    it('renders image inside list item', () => {
      const result = markdownToHtml('- ![icon](https://icon.png) item text');
      expect(result).toContain('<li><img src="https://icon.png" alt="icon" /> item text</li>');
    });

    it('renders image inside heading', () => {
      const result = markdownToHtml('## ![badge](https://badge.png) Status');
      expect(result).toContain('<h2><img src="https://badge.png" alt="badge" /> Status</h2>');
    });

    it('blocks data: URLs in images within full document', () => {
      const result = markdownToHtml('![xss](data:text/html,<script>alert(1)</script>)');
      expect(result).toContain('src="#blocked"');
      expect(result).not.toContain('data:');
    });
  });

  describe('XSS prevention - additional cases', () => {
    it('blocks vbscript: URLs in links', () => {
      const result = markdownToHtml('[click](vbscript:exec)');
      expect(result).toContain('href="#blocked"');
      expect(result).not.toContain('vbscript:');
    });

    it('blocks data: URLs in images', () => {
      const result = markdownToHtml('![img](data:image/svg+xml,<svg onload=alert(1)>)');
      expect(result).toContain('src="#blocked"');
    });

    it('escapes HTML in heading content', () => {
      const result = markdownToHtml('# <img src=x onerror=alert(1)>');
      expect(result).not.toContain('<img src=x');
      expect(result).toContain('&lt;img');
    });

    it('escapes HTML in list item content', () => {
      const result = markdownToHtml('- <script>alert(1)</script>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('escapes HTML in blockquote content', () => {
      const result = markdownToHtml('> <img src=x onerror=alert(1)>');
      expect(result).not.toContain('<img src=x');
      expect(result).toContain('&lt;img');
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = markdownToHtml('');
      // Empty paragraph gets cleaned up by the <p></p> removal regex
      expect(result).toBe('');
    });

    it('handles only whitespace', () => {
      const result = markdownToHtml('   ');
      expect(result).toContain('   ');
    });

    it('handles multiple blank lines', () => {
      const result = markdownToHtml('first\n\n\n\nfourth');
      expect(result).toContain('first</p><p>fourth');
    });

    it('handles mixed block types', () => {
      const md = '# Title\n\nSome text\n\n- item one\n- item two\n\n> A quote';
      const result = markdownToHtml(md);
      expect(result).toContain('<h1>Title</h1>');
      expect(result).toContain('Some text');
      expect(result).toContain('<li>item one</li>');
      expect(result).toContain('<blockquote>A quote</blockquote>');
    });

    it('handles heading followed immediately by list', () => {
      const result = markdownToHtml('# Title\n- item');
      expect(result).toContain('<h1>Title</h1>');
      expect(result).toContain('<li>item</li>');
    });

    it('handles list followed by paragraph text', () => {
      const result = markdownToHtml('- item\nSome text after');
      expect(result).toContain('<li>item</li>');
      expect(result).toContain('</ul>');
      expect(result).toContain('Some text after');
    });

    it('handles single list item', () => {
      const result = markdownToHtml('- only item');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>only item</li>');
      expect(result).toContain('</ul>');
    });

    it('handles single ordered list item', () => {
      const result = markdownToHtml('1. first');
      expect(result).toContain('<ol>');
      expect(result).toContain('<li>first</li>');
      expect(result).toContain('</ol>');
    });

    it('wraps fenced code blocks in pre/code tags', () => {
      const result = markdownToHtml('```\nconst x = 1;\nconst y = 2;\n```');
      expect(result).toContain('<pre><code');
      expect(result).toContain('</code></pre>');
      expect(result).toContain('const x = 1;');
    });

    it('handles text with only inline formatting', () => {
      const result = markdownToHtml('**bold** and *italic* and `code`');
      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('<em>italic</em>');
      expect(result).toContain('<code>code</code>');
    });
  });
});
