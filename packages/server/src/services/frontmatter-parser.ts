import matter from 'gray-matter';
import { readFileSync } from 'node:fs';

export interface ParsedNote {
  frontmatter: Record<string, unknown>;
  content: string;
}

export function parseNoteFrontmatter(filePath: string): ParsedNote {
  const fileContent = readFileSync(filePath, 'utf-8');
  const { data, content } = matter(fileContent);

  return {
    frontmatter: data,
    content,
  };
}

export function hasTag(frontmatter: Record<string, unknown>, tag: string): boolean {
  const tags = frontmatter.tags;

  if (!tags) return false;

  const normalizedTarget = normalizeTag(tag);

  if (Array.isArray(tags)) {
    // Match exact tag or tag with suffix (e.g., literature_note matches literature_note/read)
    return tags.some(t => {
      const normalized = normalizeTag(String(t));
      return normalized === normalizedTarget || normalized.startsWith(normalizedTarget + '/');
    });
  }

  if (typeof tags === 'string') {
    // Handle comma-separated tags
    return tags.split(',').some(t => {
      const normalized = normalizeTag(t.trim());
      return normalized === normalizedTarget || normalized.startsWith(normalizedTarget + '/');
    });
  }

  return false;
}

function normalizeTag(tag: string): string {
  // Remove # prefix if present and lowercase
  return tag.replace(/^#/, '').toLowerCase();
}

export function getSourcePath(
  frontmatter: Record<string, unknown>,
  sourceKey: string
): string | null {
  let source = frontmatter[sourceKey];

  if (!source) return null;

  // Handle array format (e.g., attachment: ["[[path|display]]"])
  if (Array.isArray(source)) {
    source = source[0];
  }

  if (typeof source === 'string') {
    // Handle Obsidian wiki-link format: [[path/to/file.pdf|displayName]]
    // The path may include a display name after |
    const wikiMatch = source.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
    if (wikiMatch) {
      return wikiMatch[1];
    }
    // Also handle quoted strings in YAML
    return source.replace(/^['"]|['"]$/g, '');
  }

  return null;
}

export function getProgress(
  frontmatter: Record<string, unknown>,
  progressKey: string
): number {
  const progress = frontmatter[progressKey];

  if (typeof progress === 'number') {
    return Math.max(0, Math.min(100, progress));
  }

  if (typeof progress === 'string') {
    const parsed = parseFloat(progress);
    if (!isNaN(parsed)) {
      return Math.max(0, Math.min(100, parsed));
    }
  }

  return 0;
}

export function getLastRead(
  frontmatter: Record<string, unknown>,
  lastReadKey: string
): string | null {
  const lastRead = frontmatter[lastReadKey];

  if (!lastRead) return null;

  if (lastRead instanceof Date) {
    return lastRead.toISOString();
  }

  if (typeof lastRead === 'string') {
    const date = new Date(lastRead);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
}

export function getDateCreated(
  frontmatter: Record<string, unknown>,
  dateCreatedKey: string
): string | null {
  const dateCreated = frontmatter[dateCreatedKey];

  if (!dateCreated) return null;

  if (dateCreated instanceof Date) {
    return dateCreated.toISOString();
  }

  if (typeof dateCreated === 'string') {
    const date = new Date(dateCreated);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
}

export function getTitle(frontmatter: Record<string, unknown>, fileName: string): string {
  if (typeof frontmatter.title === 'string' && frontmatter.title.trim()) {
    return frontmatter.title.trim();
  }

  // Fallback to filename without extension
  return fileName.replace(/\.md$/, '');
}
