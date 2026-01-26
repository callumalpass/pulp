interface CSLAuthor {
  family?: string;
  given?: string;
  literal?: string;
}

interface AuthorFieldProps {
  authors: CSLAuthor[] | string | null;
  label?: string;
}

/**
 * Renders CSL author arrays in a human-readable format.
 * Handles various CSL author formats:
 * - {family: "Smith", given: "John"} -> "John Smith"
 * - {literal: "Organization Name"} -> "Organization Name"
 * - Plain string passthrough
 */
export function AuthorField({ authors, label = 'Author' }: AuthorFieldProps) {
  if (!authors) return null;

  const formatAuthors = (): string => {
    // Handle plain string
    if (typeof authors === 'string') {
      return authors;
    }

    // Handle CSL author array
    if (Array.isArray(authors)) {
      return authors
        .map((author) => {
          if (author.literal) {
            return author.literal;
          }
          const parts = [author.given, author.family].filter(Boolean);
          return parts.join(' ');
        })
        .filter(Boolean)
        .join(', ');
    }

    return '';
  };

  const formatted = formatAuthors();
  if (!formatted) return null;

  return (
    <div className="metadata-field">
      <span className="metadata-field-label">{label}</span>
      <span className="metadata-field-value">{formatted}</span>
    </div>
  );
}
