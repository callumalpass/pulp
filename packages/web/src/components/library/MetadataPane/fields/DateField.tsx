interface CSLDate {
  'date-parts'?: number[][];
  literal?: string;
  raw?: string;
}

interface DateFieldProps {
  date: CSLDate | string | number | null;
  label?: string;
}

/**
 * Renders CSL date objects in a human-readable format.
 * Handles various CSL date formats:
 * - {date-parts: [[2007]]} -> "2007"
 * - {date-parts: [[2007, 3, 15]]} -> "March 15, 2007"
 * - {literal: "Spring 2007"} -> "Spring 2007"
 * - Plain year number -> "2007"
 * - Plain string passthrough
 */
export function DateField({ date, label = 'Date' }: DateFieldProps) {
  if (!date) return null;

  const formatDate = (): string => {
    // Handle plain number (year)
    if (typeof date === 'number') {
      return String(date);
    }

    // Handle plain string
    if (typeof date === 'string') {
      return date;
    }

    // Handle CSL date object
    if (typeof date === 'object') {
      if (date.literal) {
        return date.literal;
      }

      if (date.raw) {
        return date.raw;
      }

      if (date['date-parts'] && Array.isArray(date['date-parts']) && date['date-parts'][0]) {
        const [year, month, day] = date['date-parts'][0];

        if (!month) {
          return String(year);
        }

        const dateObj = new Date(year, (month || 1) - 1, day || 1);

        if (day) {
          return dateObj.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        }

        return dateObj.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
        });
      }
    }

    return '';
  };

  const formatted = formatDate();
  if (!formatted) return null;

  return (
    <div className="metadata-field">
      <span className="metadata-field-label">{label}</span>
      <span className="metadata-field-value">{formatted}</span>
    </div>
  );
}
