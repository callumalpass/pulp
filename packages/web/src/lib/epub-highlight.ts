// EPUB CFI (Canonical Fragment Identifier) utilities

export interface CFIRange {
  start: string;
  end: string;
}

export function parseCFI(cfi: string): { path: string; offset?: number } | null {
  // Basic CFI parsing - epub.js handles most of this internally
  const match = cfi.match(/epubcfi\((.+)\)/);
  if (!match) return null;

  const content = match[1];
  const parts = content.split(',');

  if (parts.length === 1) {
    return { path: parts[0] };
  }

  return { path: parts[0] + parts[1], offset: undefined };
}

export function compareCFI(a: string, b: string): number {
  // Simple lexicographic comparison - works for most cases
  // For proper comparison, use epub.js's built-in methods
  return a.localeCompare(b);
}

export function isCFIInRange(cfi: string, start: string, end: string): boolean {
  return compareCFI(cfi, start) >= 0 && compareCFI(cfi, end) <= 0;
}

export function extractTextFromCFI(cfi: string): string | null {
  // Extract any text hint from the CFI if present
  const match = cfi.match(/\[(.+?)\]/);
  return match ? match[1] : null;
}

export function formatCFIForDisplay(cfi: string): string {
  // Create a readable format for display
  const parsed = parseCFI(cfi);
  if (!parsed) return 'Unknown location';

  // Extract chapter/section info if possible
  const pathParts = parsed.path.split('/').filter(Boolean);
  if (pathParts.length >= 2) {
    return `Section ${pathParts[1]}`;
  }

  return 'EPUB location';
}
