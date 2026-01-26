interface WikilinkFieldProps {
  value: string | null;
  label: string;
}

/**
 * Parses and displays wikilink formatted text.
 * Handles various wikilink formats:
 * - [[Author/Name|Display Name]] -> "Display Name"
 * - [[Simple Link]] -> "Simple Link"
 * - Plain text passthrough
 */
export function WikilinkField({ value, label }: WikilinkFieldProps) {
  if (!value) return null;

  const parseWikilinks = (text: string): string => {
    // Pattern matches [[path|display]] or [[path]]
    return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, path, display) => {
      if (display) {
        return display;
      }
      // If no display text, use the last part of the path
      const parts = path.split('/');
      return parts[parts.length - 1];
    });
  };

  const parsed = parseWikilinks(value);
  if (!parsed) return null;

  return (
    <div className="metadata-field">
      <span className="metadata-field-label">{label}</span>
      <span className="metadata-field-value">{parsed}</span>
    </div>
  );
}

/**
 * Extract multiple wikilinks from a text field and render as a list
 */
export function WikilinkListField({ value, label }: WikilinkFieldProps) {
  if (!value) return null;

  // Extract all wikilinks from the text
  const wikilinkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const links: string[] = [];
  let match;

  while ((match = wikilinkPattern.exec(value)) !== null) {
    const [, path, display] = match;
    if (display) {
      links.push(display);
    } else {
      const parts = path.split('/');
      links.push(parts[parts.length - 1]);
    }
  }

  // If no wikilinks found, treat as plain text
  if (links.length === 0 && value.trim()) {
    links.push(value);
  }

  if (links.length === 0) return null;

  return (
    <div className="metadata-field">
      <span className="metadata-field-label">{label}</span>
      <span className="metadata-field-value">
        {links.join(', ')}
      </span>
    </div>
  );
}
