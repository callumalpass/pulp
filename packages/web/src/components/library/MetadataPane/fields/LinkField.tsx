import { useState, useCallback } from 'react';

interface LinkFieldProps {
  value: string | null;
  label: string;
  type: 'isbn' | 'doi' | 'url';
}

/**
 * Renders copyable link fields for ISBN, DOI, and URLs.
 * Provides copy-to-clipboard functionality and clickable links where appropriate.
 */
export function LinkField({ value, label, type }: LinkFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [value]);

  if (!value) return null;

  const getUrl = (): string | null => {
    switch (type) {
      case 'doi':
        // DOI might already be a URL or just the identifier
        if (value.startsWith('http')) {
          return value;
        }
        return `https://doi.org/${value.replace(/^doi:?\s*/i, '')}`;
      case 'isbn':
        // Link to OpenLibrary for ISBN lookup
        const cleanIsbn = value.replace(/[-\s]/g, '');
        return `https://openlibrary.org/isbn/${cleanIsbn}`;
      case 'url':
        return value;
      default:
        return null;
    }
  };

  const url = getUrl();
  const displayValue = type === 'doi' && value.startsWith('http')
    ? value.replace(/^https?:\/\/doi\.org\//, '')
    : value;

  return (
    <div className="metadata-field metadata-field-link">
      <span className="metadata-field-label">{label}</span>
      <div className="metadata-field-value-group">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="metadata-link"
            title={`Open ${label}`}
          >
            <span className="truncate">{displayValue}</span>
            <ExternalLinkIcon />
          </a>
        ) : (
          <span className="metadata-field-value truncate">{displayValue}</span>
        )}
        <button
          onClick={handleCopy}
          className="metadata-copy-btn"
          title={copied ? 'Copied!' : `Copy ${label}`}
          aria-label={copied ? 'Copied!' : `Copy ${label}`}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 ml-1 opacity-50">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
