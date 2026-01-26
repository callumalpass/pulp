import { readFileSync, writeFileSync } from 'node:fs';
import matter from 'gray-matter';

/**
 * Simple in-memory file locking service to prevent race conditions
 * when multiple requests try to modify the same file concurrently.
 *
 * Uses a per-file lock queue to ensure operations are serialized.
 */

interface LockEntry {
  promise: Promise<void>;
  resolve: () => void;
}

const locks = new Map<string, LockEntry[]>();

/**
 * Acquire a lock for a file path.
 * If the file is already locked, wait for the previous operation to complete.
 */
async function acquireLock(filePath: string): Promise<void> {
  const queue = locks.get(filePath) || [];

  // If there's a queue, wait for the last operation to complete
  if (queue.length > 0) {
    const lastLock = queue[queue.length - 1];
    await lastLock.promise;
  }

  // Create our own lock entry
  let resolve: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });

  const entry: LockEntry = { promise, resolve: resolve! };
  queue.push(entry);
  locks.set(filePath, queue);
}

/**
 * Release a lock for a file path.
 */
function releaseLock(filePath: string): void {
  const queue = locks.get(filePath);
  if (queue && queue.length > 0) {
    const entry = queue.shift()!;
    entry.resolve();

    if (queue.length === 0) {
      locks.delete(filePath);
    }
  }
}

/**
 * Result of reading and parsing a frontmatter file.
 */
export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown>;
  content: string;
}

/**
 * Perform an atomic read-modify-write operation on a frontmatter file.
 * This ensures that concurrent modifications don't overwrite each other.
 *
 * @param filePath - The path to the markdown file
 * @param modifier - A function that receives the parsed frontmatter and content,
 *                   and returns the modified frontmatter (or null to abort)
 * @returns The modified frontmatter, or null if the operation was aborted
 */
export async function atomicFrontmatterUpdate<T extends Record<string, unknown>>(
  filePath: string,
  modifier: (parsed: ParsedFrontmatter) => T | null
): Promise<T | null> {
  await acquireLock(filePath);

  try {
    // Read and parse the file
    const fileContent = readFileSync(filePath, 'utf-8');
    const { data: frontmatter, content } = matter(fileContent);

    // Apply the modification
    const modifiedFrontmatter = modifier({ frontmatter, content });

    // If modifier returned null, abort without writing
    if (modifiedFrontmatter === null) {
      return null;
    }

    // Write back the modified file
    const updated = matter.stringify(content, modifiedFrontmatter);
    writeFileSync(filePath, updated, 'utf-8');

    return modifiedFrontmatter;
  } finally {
    releaseLock(filePath);
  }
}

/**
 * Perform an atomic read-modify-write operation on a frontmatter file,
 * with the ability to also modify the markdown content.
 *
 * @param filePath - The path to the markdown file
 * @param modifier - A function that receives the parsed frontmatter and content,
 *                   and returns both the modified frontmatter and content (or null to abort)
 * @returns The modified frontmatter and content, or null if the operation was aborted
 */
export async function atomicFrontmatterAndContentUpdate<T extends Record<string, unknown>>(
  filePath: string,
  modifier: (parsed: ParsedFrontmatter) => { frontmatter: T; content: string } | null
): Promise<{ frontmatter: T; content: string } | null> {
  await acquireLock(filePath);

  try {
    // Read and parse the file
    const fileContent = readFileSync(filePath, 'utf-8');
    const { data: frontmatter, content } = matter(fileContent);

    // Apply the modification
    const result = modifier({ frontmatter, content });

    // If modifier returned null, abort without writing
    if (result === null) {
      return null;
    }

    // Write back the modified file
    const updated = matter.stringify(result.content, result.frontmatter);
    writeFileSync(filePath, updated, 'utf-8');

    return result;
  } finally {
    releaseLock(filePath);
  }
}

/**
 * Check if a file is currently locked.
 * Useful for debugging and testing.
 */
export function isFileLocked(filePath: string): boolean {
  const queue = locks.get(filePath);
  return queue !== undefined && queue.length > 0;
}

/**
 * Get the number of pending operations for a file.
 * Useful for debugging and testing.
 */
export function getPendingOperations(filePath: string): number {
  const queue = locks.get(filePath);
  return queue ? queue.length : 0;
}
