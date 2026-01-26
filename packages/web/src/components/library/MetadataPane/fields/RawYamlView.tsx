import { useState } from 'react';

interface RawYamlViewProps {
  frontmatter: Record<string, unknown>;
}

/**
 * Displays raw frontmatter as formatted JSON for power users.
 * Provides copy-to-clipboard functionality.
 */
export function RawYamlView({ frontmatter }: RawYamlViewProps) {
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(frontmatter, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="metadata-raw-view">
      <div className="metadata-raw-header">
        <span className="text-xs text-text-secondary">JSON</span>
        <button
          onClick={handleCopy}
          className="metadata-copy-btn"
          title={copied ? 'Copied!' : 'Copy JSON'}
          aria-label={copied ? 'Copied!' : 'Copy JSON'}
        >
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      </div>
      <pre className="metadata-raw-content">
        <code>{jsonString}</code>
      </pre>
    </div>
  );
}
