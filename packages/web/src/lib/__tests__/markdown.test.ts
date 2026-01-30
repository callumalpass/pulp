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

  it('blocks javascript: with tab character after whitespace', () => {
    expect(sanitizeUrl('\tjavascript:alert(1)')).toBe('#blocked');
  });

  it('blocks javascript: with newline before protocol', () => {
    expect(sanitizeUrl('\njavascript:alert(1)')).toBe('#blocked');
  });

  it('allows ftp: protocol', () => {
    expect(sanitizeUrl('ftp://files.example.com')).toBe('ftp://files.example.com');
  });

  it('allows tel: protocol', () => {
    expect(sanitizeUrl('tel:+1234567890')).toBe('tel:+1234567890');
  });

  it('handles URL with only whitespace', () => {
    expect(sanitizeUrl('   ')).toBe('   ');
  });

  it('blocks data: with base64 payload', () => {
    expect(sanitizeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe('#blocked');
  });

  it('blocks JAVASCRIPT: all caps', () => {
    expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBe('#blocked');
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

  describe('unclosed and edge-case markers', () => {
    it('leaves unclosed bold markers as-is', () => {
      const result = processInlineMarkdown('**unclosed bold');
      expect(result).toBe('**unclosed bold');
      expect(result).not.toContain('<strong>');
    });

    it('leaves unclosed italic markers as-is', () => {
      const result = processInlineMarkdown('*unclosed italic');
      expect(result).toBe('*unclosed italic');
      expect(result).not.toContain('<em>');
    });

    it('leaves unclosed strikethrough markers as-is', () => {
      const result = processInlineMarkdown('~~unclosed strike');
      expect(result).toBe('~~unclosed strike');
      expect(result).not.toContain('<del>');
    });

    it('leaves unclosed inline code as-is', () => {
      const result = processInlineMarkdown('`unclosed code');
      expect(result).toBe('`unclosed code');
      expect(result).not.toContain('<code>');
    });

    it('handles adjacent bold segments', () => {
      const result = processInlineMarkdown('**first****second**');
      expect(result).toContain('<strong>');
    });

    it('handles bold inside italic context', () => {
      const result = processInlineMarkdown('*italic **bold** end*');
      expect(result).toContain('<em>');
      expect(result).toContain('<strong>bold</strong>');
    });

    it('handles multiple bold segments in one line', () => {
      const result = processInlineMarkdown('**a** middle **b**');
      expect(result).toBe('<strong>a</strong> middle <strong>b</strong>');
    });

    it('handles multiple italic segments in one line', () => {
      const result = processInlineMarkdown('*a* and *b* and *c*');
      expect(result).toBe('<em>a</em> and <em>b</em> and <em>c</em>');
    });

    it('handles strikethrough with bold inside', () => {
      const result = processInlineMarkdown('~~strike **bold** text~~');
      expect(result).toBe('<del>strike <strong>bold</strong> text</del>');
    });

    it('handles formatting markers with special characters', () => {
      const result = processInlineMarkdown('**bold & special**');
      expect(result).toBe('<strong>bold & special</strong>');
    });
  });

  describe('multiple links and images', () => {
    it('handles multiple links in one line', () => {
      const result = processInlineMarkdown('[a](https://a.com) and [b](https://b.com)');
      expect(result).toContain('<a href="https://a.com"');
      expect(result).toContain('>a</a>');
      expect(result).toContain('<a href="https://b.com"');
      expect(result).toContain('>b</a>');
    });

    it('handles link with formatted text', () => {
      const result = processInlineMarkdown('[**bold link**](https://example.com)');
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('<strong>bold link</strong>');
    });

    it('handles link with query parameters', () => {
      const result = processInlineMarkdown('[search](https://example.com?q=test&page=1)');
      expect(result).toContain('href="https://example.com?q=test&page=1"');
    });

    it('handles image with data URI blocked', () => {
      const result = processInlineMarkdown('![img](data:image/png;base64,abc)');
      expect(result).toBe('<img src="#blocked" alt="img" />');
    });
  });

  it('returns plain text unchanged', () => {
    expect(processInlineMarkdown('just plain text')).toBe('just plain text');
  });

  it('handles empty string', () => {
    expect(processInlineMarkdown('')).toBe('');
  });

  it('handles text with only spaces', () => {
    expect(processInlineMarkdown('   ')).toBe('   ');
  });

  it('handles text with numbers', () => {
    expect(processInlineMarkdown('count: 42')).toBe('count: 42');
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

    it('handles single newline (not double)', () => {
      const result = markdownToHtml('line one\nline two');
      expect(result).toContain('line one<br />line two');
      // Should be in the same paragraph, not split
      expect(result).not.toContain('</p><p>');
    });

    it('handles triple+ newlines same as double', () => {
      const result = markdownToHtml('first\n\n\nsecond');
      expect(result).toContain('first</p><p>second');
    });
  });

  describe('blockquote merging', () => {
    it('merges two consecutive blockquote lines into one blockquote', () => {
      const result = markdownToHtml('> line one\n> line two');
      // After merging, should not have separate blockquote tags
      expect(result).not.toContain('</blockquote><br /><blockquote>');
      // Should contain both lines
      expect(result).toContain('line one');
      expect(result).toContain('line two');
    });

    it('merges three consecutive blockquote lines', () => {
      const result = markdownToHtml('> first\n> second\n> third');
      expect(result).not.toContain('</blockquote><br /><blockquote>');
      expect(result).toContain('first');
      expect(result).toContain('second');
      expect(result).toContain('third');
    });

    it('does not merge blockquotes separated by blank line', () => {
      const result = markdownToHtml('> quote one\n\n> quote two');
      // Double newline creates paragraph break, so blockquotes are separate
      expect(result).toContain('quote one');
      expect(result).toContain('quote two');
    });

    it('applies inline formatting inside blockquotes', () => {
      const result = markdownToHtml('> **bold** quote');
      expect(result).toContain('<blockquote><strong>bold</strong> quote</blockquote>');
    });
  });

  describe('list edge cases', () => {
    it('closes list when followed by empty line then text', () => {
      const result = markdownToHtml('- item\n\nText after');
      expect(result).toContain('</ul>');
      expect(result).toContain('Text after');
    });

    it('handles long ordered list numbers', () => {
      const result = markdownToHtml('10. tenth item\n11. eleventh item');
      expect(result).toContain('<ol>');
      expect(result).toContain('<li>tenth item</li>');
      expect(result).toContain('<li>eleventh item</li>');
    });

    it('applies inline formatting in ordered list items', () => {
      const result = markdownToHtml('1. **bold** item\n2. *italic* item');
      expect(result).toContain('<li><strong>bold</strong> item</li>');
      expect(result).toContain('<li><em>italic</em> item</li>');
    });

    it('handles list with link inside item', () => {
      const result = markdownToHtml('- see [docs](https://docs.com)');
      expect(result).toContain('<li>see <a href="https://docs.com"');
    });

    it('handles ul followed directly by ol with correct closing', () => {
      const result = markdownToHtml('- bullet one\n- bullet two\n1. number one\n2. number two');
      // Should close ul before opening ol
      const ulClosePos = result.indexOf('</ul>');
      const olOpenPos = result.indexOf('<ol>');
      expect(ulClosePos).toBeGreaterThan(-1);
      expect(olOpenPos).toBeGreaterThan(-1);
      expect(ulClosePos).toBeLessThan(olOpenPos);
      expect(result).toContain('<li>bullet one</li>');
      expect(result).toContain('<li>number one</li>');
    });

    it('handles ol followed directly by ul with correct closing', () => {
      const result = markdownToHtml('1. first\n2. second\n- bullet a\n- bullet b');
      const olClosePos = result.indexOf('</ol>');
      const ulOpenPos = result.indexOf('<ul>');
      expect(olClosePos).toBeGreaterThan(-1);
      expect(ulOpenPos).toBeGreaterThan(-1);
      expect(olClosePos).toBeLessThan(ulOpenPos);
    });
  });

  describe('code block edge cases', () => {
    it('preserves multiple lines inside code block', () => {
      const result = markdownToHtml('```js\nline1\nline2\nline3\n```');
      expect(result).toContain('<pre><code class="language-js">');
      expect(result).toContain('line1');
      expect(result).toContain('line2');
      expect(result).toContain('line3');
    });

    it('handles code block with python language', () => {
      const result = markdownToHtml('```python\ndef hello():\n    pass\n```');
      expect(result).toContain('class="language-python"');
    });

    it('handles code block with typescript language', () => {
      const result = markdownToHtml('```typescript\nconst x: number = 1;\n```');
      expect(result).toContain('class="language-typescript"');
    });
  });

  describe('heading edge cases', () => {
    it('handles all three heading levels in sequence', () => {
      const result = markdownToHtml('# H1\n## H2\n### H3');
      expect(result).toContain('<h1>H1</h1>');
      expect(result).toContain('<h2>H2</h2>');
      expect(result).toContain('<h3>H3</h3>');
    });

    it('handles heading with link inside', () => {
      const result = markdownToHtml('## See [docs](https://example.com)');
      expect(result).toContain('<h2>See <a href="https://example.com"');
    });

    it('handles heading followed by blockquote', () => {
      const result = markdownToHtml('# Title\n> Quote text');
      expect(result).toContain('<h1>Title</h1>');
      expect(result).toContain('<blockquote>Quote text</blockquote>');
    });

    it('handles heading followed by horizontal rule', () => {
      const result = markdownToHtml('# Title\n---');
      expect(result).toContain('<h1>Title</h1>');
      expect(result).toContain('<hr />');
    });
  });

  describe('horizontal rule edge cases', () => {
    it('handles hr between paragraphs', () => {
      const result = markdownToHtml('Above\n---\nBelow');
      expect(result).toContain('<hr />');
      expect(result).toContain('Above');
      expect(result).toContain('Below');
    });

    it('only matches exactly --- for hr', () => {
      // The source checks line === '---' after HTML escaping
      const result = markdownToHtml('----');
      // Four dashes should not produce <hr /> since it checks for exact '---'
      expect(result).not.toContain('<hr />');
    });
  });

  describe('complex document structures', () => {
    it('handles a full document with multiple block types', () => {
      const md = [
        '# Main Title',
        '',
        'Intro paragraph with **bold** text.',
        '',
        '## Section One',
        '',
        '- item a',
        '- item b',
        '',
        '> A quoted passage',
        '',
        '1. step one',
        '2. step two',
        '',
        '---',
        '',
        '### Subsection',
        '',
        'Final text with [link](https://example.com).',
      ].join('\n');

      const result = markdownToHtml(md);
      expect(result).toContain('<h1>Main Title</h1>');
      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('<h2>Section One</h2>');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>item a</li>');
      expect(result).toContain('<blockquote>A quoted passage</blockquote>');
      expect(result).toContain('<ol>');
      expect(result).toContain('<li>step one</li>');
      expect(result).toContain('<hr />');
      expect(result).toContain('<h3>Subsection</h3>');
      expect(result).toContain('href="https://example.com"');
    });

    it('handles heading, list, and blockquote without blank lines between', () => {
      const md = '# Title\n- item\n> quote';
      const result = markdownToHtml(md);
      expect(result).toContain('<h1>Title</h1>');
      expect(result).toContain('<li>item</li>');
      expect(result).toContain('<blockquote>quote</blockquote>');
    });

    it('handles paragraph between two lists', () => {
      const md = '- first list\n\nMiddle text\n\n1. second list';
      const result = markdownToHtml(md);
      expect(result).toContain('</ul>');
      expect(result).toContain('Middle text');
      expect(result).toContain('<ol>');
    });
  });

  describe('HTML escaping edge cases', () => {
    it('escapes HTML inside list items', () => {
      const result = markdownToHtml('- <b>not bold</b>');
      expect(result).toContain('&lt;b&gt;not bold&lt;/b&gt;');
      expect(result).not.toContain('<b>');
    });

    it('escapes HTML inside blockquotes', () => {
      const result = markdownToHtml('> text with "quotes" & <tags>');
      expect(result).toContain('&quot;quotes&quot;');
      expect(result).toContain('&amp;');
      expect(result).toContain('&lt;tags&gt;');
    });

    it('escapes ampersand in code blocks', () => {
      const result = markdownToHtml('```\na && b\n```');
      expect(result).toContain('&amp;&amp;');
    });
  });
});
