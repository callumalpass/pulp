interface SimpleFieldProps {
  value: unknown;
  label: string;
}

/**
 * Simple field that displays any value as a string.
 * Returns null if value is falsy.
 */
export function SimpleField({ value, label }: SimpleFieldProps) {
  if (!value) return null;

  const displayValue = typeof value === 'string' ? value : String(value);
  if (!displayValue) return null;

  return (
    <div className="metadata-field">
      <span className="metadata-field-label">{label}</span>
      <span className="metadata-field-value">{displayValue}</span>
    </div>
  );
}
