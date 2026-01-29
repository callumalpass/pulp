import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  atomicFrontmatterUpdate,
  atomicFrontmatterAndContentUpdate,
  isFileLocked,
  getPendingOperations,
} from '../file-lock.js';

// Mock fs module
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { readFileSync, writeFileSync } from 'node:fs';

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

describe('file-lock', () => {
  beforeEach(() => {
    // Reset all mocks including implementations
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('atomicFrontmatterUpdate', () => {
    it('reads file, applies modifier, and writes back', async () => {
      const filePath = '/test/note.md';
      const originalContent = `---
title: Test
progress: 50
---

Some content here`;

      mockReadFileSync.mockReturnValue(originalContent);

      const result = await atomicFrontmatterUpdate(filePath, ({ frontmatter }) => {
        return { ...frontmatter, progress: 75 } as Record<string, unknown>;
      });

      expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        filePath,
        expect.stringContaining('progress: 75'),
        'utf-8'
      );
      expect(result).toEqual({ title: 'Test', progress: 75 });
    });

    it('preserves markdown content when updating frontmatter', async () => {
      const filePath = '/test/note.md';
      const originalContent = `---
title: My Book
---

# Chapter 1

Some important content.`;

      mockReadFileSync.mockReturnValue(originalContent);

      await atomicFrontmatterUpdate(filePath, ({ frontmatter }) => {
        return { ...frontmatter, rating: 5 } as Record<string, unknown>;
      });

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('# Chapter 1');
      expect(writtenContent).toContain('Some important content.');
      expect(writtenContent).toContain('rating: 5');
    });

    it('returns null and does not write when modifier returns null', async () => {
      const filePath = '/test/note.md';
      mockReadFileSync.mockReturnValue(`---
title: Test
---
Content`);

      const result = await atomicFrontmatterUpdate(filePath, () => null);

      expect(result).toBeNull();
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('passes frontmatter and content to modifier', async () => {
      const filePath = '/test/note.md';
      const originalContent = `---
author: John Doe
year: 2024
---

The actual markdown content.`;

      mockReadFileSync.mockReturnValue(originalContent);

      let receivedParsed: { frontmatter: Record<string, unknown>; content: string } | null = null;

      await atomicFrontmatterUpdate(filePath, (parsed) => {
        receivedParsed = parsed;
        return parsed.frontmatter;
      });

      expect(receivedParsed).not.toBeNull();
      expect(receivedParsed!.frontmatter).toEqual({ author: 'John Doe', year: 2024 });
      expect(receivedParsed!.content.trim()).toBe('The actual markdown content.');
    });

    it('handles empty frontmatter', async () => {
      const filePath = '/test/note.md';
      mockReadFileSync.mockReturnValue(`---
---
Just content`);

      const result = await atomicFrontmatterUpdate(filePath, ({ frontmatter }) => {
        return { ...frontmatter, newField: 'value' };
      });

      expect(result).toEqual({ newField: 'value' });
    });

    it('handles file without frontmatter delimiter', async () => {
      const filePath = '/test/note.md';
      mockReadFileSync.mockReturnValue('Just plain content without frontmatter');

      const result = await atomicFrontmatterUpdate(filePath, ({ frontmatter }) => {
        return { ...frontmatter, added: true };
      });

      expect(result).toEqual({ added: true });
    });

    it('releases lock even when modifier throws', async () => {
      const filePath = '/test/note.md';
      mockReadFileSync.mockReturnValue(`---
title: Test
---
Content`);

      await expect(
        atomicFrontmatterUpdate(filePath, () => {
          throw new Error('Modifier error');
        })
      ).rejects.toThrow('Modifier error');

      // Lock should be released - another operation should proceed
      expect(isFileLocked(filePath)).toBe(false);
    });

    it('releases lock even when read throws', async () => {
      const filePath = '/test/note.md';
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      await expect(
        atomicFrontmatterUpdate(filePath, ({ frontmatter }) => frontmatter)
      ).rejects.toThrow('Read error');

      expect(isFileLocked(filePath)).toBe(false);
    });

    it('releases lock even when write throws', async () => {
      const filePath = '/test/note.md';
      mockReadFileSync.mockReturnValue(`---
title: Test
---
Content`);
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('Write error');
      });

      await expect(
        atomicFrontmatterUpdate(filePath, ({ frontmatter }) => frontmatter)
      ).rejects.toThrow('Write error');

      expect(isFileLocked(filePath)).toBe(false);
    });
  });

  describe('atomicFrontmatterAndContentUpdate', () => {
    it('reads file, applies modifier to both frontmatter and content, and writes back', async () => {
      const filePath = '/test/note.md';
      const originalContent = `---
title: Test
---

Original content`;

      mockReadFileSync.mockReturnValue(originalContent);

      const result = await atomicFrontmatterAndContentUpdate(filePath, ({ frontmatter, content }) => {
        return {
          frontmatter: { ...frontmatter, modified: true } as Record<string, unknown>,
          content: content + '\n\nAppended text',
        };
      });

      expect(result).not.toBeNull();
      expect(result!.frontmatter).toEqual({ title: 'Test', modified: true });
      expect(result!.content).toContain('Appended text');

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('modified: true');
      expect(writtenContent).toContain('Appended text');
    });

    it('returns null and does not write when modifier returns null', async () => {
      const filePath = '/test/note.md';
      mockReadFileSync.mockReturnValue(`---
title: Test
---
Content`);

      const result = await atomicFrontmatterAndContentUpdate(filePath, () => null);

      expect(result).toBeNull();
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('can completely replace content', async () => {
      const filePath = '/test/note.md';
      mockReadFileSync.mockReturnValue(`---
title: Old
---

Old content to be replaced`);

      await atomicFrontmatterAndContentUpdate(filePath, () => ({
        frontmatter: { title: 'New' },
        content: 'Brand new content',
      }));

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('title: New');
      expect(writtenContent).toContain('Brand new content');
      expect(writtenContent).not.toContain('Old content');
    });

    it('releases lock even when modifier throws', async () => {
      const filePath = '/test/note.md';
      mockReadFileSync.mockReturnValue(`---
title: Test
---
Content`);

      await expect(
        atomicFrontmatterAndContentUpdate(filePath, () => {
          throw new Error('Content modifier error');
        })
      ).rejects.toThrow('Content modifier error');

      expect(isFileLocked(filePath)).toBe(false);
    });

    it('releases lock even when read throws', async () => {
      const filePath = '/test/content-read-fail.md';
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      await expect(
        atomicFrontmatterAndContentUpdate(filePath, ({ frontmatter, content }) => ({
          frontmatter,
          content,
        }))
      ).rejects.toThrow('Read error');

      expect(isFileLocked(filePath)).toBe(false);
    });

    it('releases lock even when write throws', async () => {
      const filePath = '/test/content-write-fail.md';
      mockReadFileSync.mockReturnValue(`---
title: Test
---
Content`);
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('Write error');
      });

      await expect(
        atomicFrontmatterAndContentUpdate(filePath, ({ frontmatter, content }) => ({
          frontmatter,
          content,
        }))
      ).rejects.toThrow('Write error');

      expect(isFileLocked(filePath)).toBe(false);
    });

    it('passes frontmatter and content to modifier', async () => {
      const filePath = '/test/content-parsed.md';
      const originalContent = `---
author: Jane Austen
year: 1813
---

Pride and Prejudice content here.`;

      mockReadFileSync.mockReturnValue(originalContent);

      let receivedParsed: { frontmatter: Record<string, unknown>; content: string } | null = null;

      await atomicFrontmatterAndContentUpdate(filePath, (parsed) => {
        receivedParsed = parsed;
        return { frontmatter: parsed.frontmatter, content: parsed.content };
      });

      expect(receivedParsed).not.toBeNull();
      expect(receivedParsed!.frontmatter).toEqual({ author: 'Jane Austen', year: 1813 });
      expect(receivedParsed!.content.trim()).toBe('Pride and Prejudice content here.');
    });

    it('handles empty frontmatter with content update', async () => {
      const filePath = '/test/empty-fm-content.md';
      mockReadFileSync.mockReturnValue(`---
---
Just content`);

      const result = await atomicFrontmatterAndContentUpdate(filePath, () => ({
        frontmatter: { added: 'field' },
        content: 'Updated content',
      }));

      expect(result).not.toBeNull();
      expect(result!.frontmatter).toEqual({ added: 'field' });
      expect(result!.content).toBe('Updated content');
    });

    it('handles file without frontmatter delimiter', async () => {
      const filePath = '/test/no-fm-content.md';
      mockReadFileSync.mockReturnValue('Plain content without frontmatter');

      const result = await atomicFrontmatterAndContentUpdate(filePath, ({ content }) => ({
        frontmatter: { title: 'Added' },
        content: content + ' and more',
      }));

      expect(result).not.toBeNull();
      expect(result!.frontmatter).toEqual({ title: 'Added' });
      expect(result!.content).toContain('Plain content without frontmatter');
      expect(result!.content).toContain('and more');
    });

    it('handles setting content to empty string', async () => {
      const filePath = '/test/clear-content.md';
      mockReadFileSync.mockReturnValue(`---
title: Test
---

Some existing content`);

      const result = await atomicFrontmatterAndContentUpdate(filePath, ({ frontmatter }) => ({
        frontmatter: { ...frontmatter, cleared: true } as Record<string, unknown>,
        content: '',
      }));

      expect(result).not.toBeNull();
      expect(result!.content).toBe('');
      expect(result!.frontmatter.cleared).toBe(true);
    });

    it('serializes concurrent content updates on the same file', async () => {
      const filePath = '/test/concurrent-content.md';
      const executionOrder: number[] = [];

      mockReadFileSync.mockReturnValue(`---
title: Test
---
Content`);

      const op1 = atomicFrontmatterAndContentUpdate(filePath, ({ frontmatter, content }) => {
        executionOrder.push(1);
        return { frontmatter, content: content + ' op1' };
      });

      const op2 = atomicFrontmatterAndContentUpdate(filePath, ({ frontmatter, content }) => {
        executionOrder.push(2);
        return { frontmatter, content: content + ' op2' };
      });

      await Promise.all([op1, op2]);

      expect(executionOrder).toEqual([1, 2]);
    });
  });

  describe('lock serialization', () => {
    it('serializes concurrent operations on the same file', async () => {
      const filePath = '/test/concurrent.md';
      const executionOrder: number[] = [];

      // Track execution order
      let readCount = 0;
      mockReadFileSync.mockImplementation(() => {
        readCount++;
        return `---
count: ${readCount}
---
Content`;
      });

      // Create multiple concurrent updates
      const operation1 = atomicFrontmatterUpdate(filePath, async ({ frontmatter }) => {
        executionOrder.push(1);
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { ...frontmatter, op: 1 };
      });

      const operation2 = atomicFrontmatterUpdate(filePath, async ({ frontmatter }) => {
        executionOrder.push(2);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { ...frontmatter, op: 2 };
      });

      const operation3 = atomicFrontmatterUpdate(filePath, async ({ frontmatter }) => {
        executionOrder.push(3);
        return { ...frontmatter, op: 3 };
      });

      await Promise.all([operation1, operation2, operation3]);

      // Operations should execute in order (1, 2, 3) due to serialization
      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('allows parallel operations on different files', async () => {
      const file1 = '/test/file1.md';
      const file2 = '/test/file2.md';

      mockReadFileSync.mockReturnValue(`---
title: Test
---
Content`);

      const startTimes: Record<string, number> = {};

      const op1 = atomicFrontmatterUpdate(file1, async ({ frontmatter }) => {
        startTimes['file1'] = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 20));
        return frontmatter;
      });

      const op2 = atomicFrontmatterUpdate(file2, async ({ frontmatter }) => {
        startTimes['file2'] = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 20));
        return frontmatter;
      });

      await Promise.all([op1, op2]);

      // Both operations should start at approximately the same time
      // since they're on different files
      const timeDiff = Math.abs(startTimes['file1'] - startTimes['file2']);
      expect(timeDiff).toBeLessThan(15); // Allow small timing variance
    });
  });

  describe('isFileLocked', () => {
    it('returns false for unlocked file', () => {
      expect(isFileLocked('/test/unlocked.md')).toBe(false);
    });

    it('returns true while operation is in progress', async () => {
      const filePath = '/test/locked.md';
      mockReadFileSync.mockReturnValue(`---
title: Test
---
Content`);

      let checkedDuringOperation = false;

      const operation = atomicFrontmatterUpdate(filePath, async ({ frontmatter }) => {
        // Check lock status during operation
        checkedDuringOperation = isFileLocked(filePath);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return frontmatter;
      });

      await operation;

      expect(checkedDuringOperation).toBe(true);
      // After operation completes, lock should be released
      expect(isFileLocked(filePath)).toBe(false);
    });
  });

  describe('getPendingOperations', () => {
    it('returns 0 for file with no pending operations', () => {
      expect(getPendingOperations('/test/no-pending.md')).toBe(0);
    });

    it('tracks pending operations during execution', async () => {
      const filePath = '/test/pending.md';
      mockReadFileSync.mockReturnValue(`---
title: Test
---
Content`);

      let pendingDuringFirst = 0;

      // Start a blocking operation
      const operation = atomicFrontmatterUpdate(filePath, async ({ frontmatter }) => {
        // At this point, this operation is in the queue
        pendingDuringFirst = getPendingOperations(filePath);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return frontmatter;
      });

      await operation;

      // The implementation tracks one entry when an operation is running
      expect(pendingDuringFirst).toBe(1);
      // After completion, queue is cleared
      expect(getPendingOperations(filePath)).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles complex frontmatter types', async () => {
      const filePath = '/test/complex.md';
      mockReadFileSync.mockReturnValue(`---
title: Test
tags:
  - tag1
  - tag2
nested:
  key: value
  array:
    - 1
    - 2
---
Content`);

      const result = await atomicFrontmatterUpdate(filePath, ({ frontmatter }) => {
        return {
          ...frontmatter,
          tags: [...(frontmatter.tags as string[]), 'tag3'],
        };
      });

      expect(result!.tags).toEqual(['tag1', 'tag2', 'tag3']);
      expect(result!.nested).toEqual({ key: 'value', array: [1, 2] });
    });

    it('handles frontmatter with special characters', async () => {
      const filePath = '/test/special.md';
      mockReadFileSync.mockReturnValue(`---
title: "Book: A Story"
author: "O'Brien, John"
---
Content`);

      const result = await atomicFrontmatterUpdate(filePath, ({ frontmatter }) => {
        return { ...frontmatter, rating: 5 };
      });

      expect(result!.title).toBe('Book: A Story');
      expect(result!.author).toBe("O'Brien, John");
    });

    it('handles unicode content', async () => {
      const filePath = '/test/unicode.md';
      mockReadFileSync.mockReturnValue(`---
title: "日本語タイトル"
---
Content with emoji: 📚🎉`);

      const result = await atomicFrontmatterUpdate(filePath, ({ frontmatter }) => {
        return { ...frontmatter, updated: true };
      });

      expect(result!.title).toBe('日本語タイトル');

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('📚🎉');
    });

    it('handles multiline string values in frontmatter', async () => {
      const filePath = '/test/multiline.md';
      mockReadFileSync.mockReturnValue(`---
title: Test
description: |
  This is a multiline
  description that spans
  multiple lines
---
Content`);

      const result = await atomicFrontmatterUpdate(filePath, ({ frontmatter }) => {
        return { ...frontmatter, modified: true };
      });

      expect(result!.description).toContain('multiline');
    });

    it('handles very long content', async () => {
      const filePath = '/test/long.md';
      const longContent = 'A'.repeat(100000);
      mockReadFileSync.mockReturnValue(`---
title: Long
---
${longContent}`);

      await atomicFrontmatterUpdate(filePath, ({ frontmatter }) => {
        return { ...frontmatter, processed: true };
      });

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent.length).toBeGreaterThan(100000);
    });
  });

  describe('type safety', () => {
    it('returns typed frontmatter from atomicFrontmatterUpdate', async () => {
      interface BookFrontmatter {
        title: string;
        progress: number;
        rating?: number;
      }

      const filePath = '/test/typed.md';
      mockReadFileSync.mockReturnValue(`---
title: Test Book
progress: 50
---
Content`);

      const result = await atomicFrontmatterUpdate<BookFrontmatter>(filePath, ({ frontmatter }) => {
        return {
          title: frontmatter.title as string,
          progress: (frontmatter.progress as number) + 10,
          rating: 5,
        };
      });

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Test Book');
      expect(result!.progress).toBe(60);
      expect(result!.rating).toBe(5);
    });

    it('returns typed result from atomicFrontmatterAndContentUpdate', async () => {
      interface NoteMeta {
        title: string;
        wordCount: number;
      }

      const filePath = '/test/typed-content.md';
      mockReadFileSync.mockReturnValue(`---
title: My Note
wordCount: 0
---
Hello world`);

      const result = await atomicFrontmatterAndContentUpdate<NoteMeta>(filePath, ({ content }) => {
        const words = content.trim().split(/\s+/).length;
        return {
          frontmatter: { title: 'My Note', wordCount: words },
          content,
        };
      });

      expect(result).not.toBeNull();
      expect(result!.frontmatter.title).toBe('My Note');
      expect(result!.frontmatter.wordCount).toBe(2);
    });
  });

  describe('error recovery', () => {
    it('allows subsequent operations after a modifier error', async () => {
      const filePath = '/test/recovery.md';
      mockReadFileSync.mockReturnValue(`---
title: Test
---
Content`);

      // First operation fails
      await expect(
        atomicFrontmatterUpdate(filePath, () => {
          throw new Error('First op failed');
        })
      ).rejects.toThrow('First op failed');

      // Second operation should succeed
      const result = await atomicFrontmatterUpdate(filePath, ({ frontmatter }) => {
        return { ...frontmatter, recovered: true };
      });

      expect(result).toEqual({ title: 'Test', recovered: true });
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    });

    it('allows subsequent operations after a read error', async () => {
      const filePath = '/test/read-recovery.md';

      // First call throws, second call succeeds
      mockReadFileSync
        .mockImplementationOnce(() => {
          throw new Error('Disk error');
        })
        .mockReturnValueOnce(`---
title: Recovered
---
Content`);

      await expect(
        atomicFrontmatterUpdate(filePath, ({ frontmatter }) => frontmatter)
      ).rejects.toThrow('Disk error');

      const result = await atomicFrontmatterUpdate(filePath, ({ frontmatter }) => {
        return { ...frontmatter, ok: true };
      });

      expect(result).toEqual({ title: 'Recovered', ok: true });
    });

    it('allows subsequent operations after a write error', async () => {
      const filePath = '/test/write-recovery.md';
      mockReadFileSync.mockReturnValue(`---
title: Test
---
Content`);

      // First write fails, second succeeds
      mockWriteFileSync
        .mockImplementationOnce(() => {
          throw new Error('Disk full');
        })
        .mockImplementationOnce(() => {});

      await expect(
        atomicFrontmatterUpdate(filePath, ({ frontmatter }) => frontmatter)
      ).rejects.toThrow('Disk full');

      const result = await atomicFrontmatterUpdate(filePath, ({ frontmatter }) => {
        return { ...frontmatter, retried: true };
      });

      expect(result).toEqual({ title: 'Test', retried: true });
    });

    it('processes remaining queued operations after a mid-chain failure', async () => {
      const filePath = '/test/chain-recovery.md';
      const completedOps: number[] = [];

      mockReadFileSync.mockReturnValue(`---
title: Test
---
Content`);

      const op1 = atomicFrontmatterUpdate(filePath, async ({ frontmatter }) => {
        completedOps.push(1);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return frontmatter;
      });

      const op2 = atomicFrontmatterUpdate(filePath, async () => {
        throw new Error('Op2 failed');
      });

      const op3 = atomicFrontmatterUpdate(filePath, async ({ frontmatter }) => {
        completedOps.push(3);
        return { ...frontmatter, fromOp3: true };
      });

      const results = await Promise.allSettled([op1, op2, op3]);

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
      expect(completedOps).toContain(1);
      expect(completedOps).toContain(3);
    });

    it('allows contentUpdate after frontmatterUpdate error on same file', async () => {
      const filePath = '/test/cross-recovery.md';
      mockReadFileSync.mockReturnValue(`---
title: Test
---
Content`);

      await expect(
        atomicFrontmatterUpdate(filePath, () => {
          throw new Error('Frontmatter update failed');
        })
      ).rejects.toThrow('Frontmatter update failed');

      const result = await atomicFrontmatterAndContentUpdate(filePath, ({ frontmatter, content }) => ({
        frontmatter: { ...frontmatter, recovered: true } as Record<string, unknown>,
        content: content + '\nRecovered',
      }));

      expect(result).not.toBeNull();
      expect(result!.frontmatter.recovered).toBe(true);
      expect(result!.content).toContain('Recovered');
    });
  });

  describe('mixed operation serialization', () => {
    it('serializes atomicFrontmatterUpdate and atomicFrontmatterAndContentUpdate on the same file', async () => {
      const filePath = '/test/mixed.md';
      const executionOrder: string[] = [];

      mockReadFileSync.mockReturnValue(`---
title: Test
---
Content`);

      const fmUpdate = atomicFrontmatterUpdate(filePath, async ({ frontmatter }) => {
        executionOrder.push('frontmatter');
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { ...frontmatter, step: 1 };
      });

      const contentUpdate = atomicFrontmatterAndContentUpdate(filePath, ({ frontmatter, content }) => {
        executionOrder.push('content');
        return {
          frontmatter: { ...frontmatter, step: 2 } as Record<string, unknown>,
          content: content + ' updated',
        };
      });

      await Promise.all([fmUpdate, contentUpdate]);

      expect(executionOrder).toEqual(['frontmatter', 'content']);
    });

    it('does not block different files across operation types', async () => {
      const file1 = '/test/mixed-a.md';
      const file2 = '/test/mixed-b.md';
      const executionOrder: string[] = [];

      mockReadFileSync.mockReturnValue(`---
title: Test
---
Content`);

      const op1 = atomicFrontmatterUpdate(file1, async ({ frontmatter }) => {
        executionOrder.push('fm-start');
        await new Promise((resolve) => setTimeout(resolve, 20));
        executionOrder.push('fm-end');
        return frontmatter;
      });

      const op2 = atomicFrontmatterAndContentUpdate(file2, ({ frontmatter, content }) => {
        executionOrder.push('content');
        return { frontmatter, content };
      });

      await Promise.all([op1, op2]);

      // Content op on file2 should not wait for fm op on file1 to finish
      // so 'content' should appear before 'fm-end'
      const contentIdx = executionOrder.indexOf('content');
      const fmEndIdx = executionOrder.indexOf('fm-end');
      expect(contentIdx).toBeLessThan(fmEndIdx);
    });
  });
});
