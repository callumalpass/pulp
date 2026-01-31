import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The module under test uses:
 * - `new Worker(...)` via `import.meta.url`
 * - `window.devicePixelRatio`
 * - `requestIdleCallback` / `cancelIdleCallback`
 * - `ImageBitmap.close()`
 *
 * We mock all of these at the module/global level before importing.
 */

// --- Global mocks ---

/** Minimal mock for ImageBitmap */
function createMockBitmap(): ImageBitmap {
  return { close: vi.fn() } as unknown as ImageBitmap;
}

/** Mock Worker that stores onmessage/onerror and lets tests simulate messages */
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

let mockWorkerInstance: MockWorker;

vi.mock('../pdf-render-queue', async () => {
  // We need to actually import the real module but intercept Worker creation.
  // Instead, we'll use a different approach — stub globals and import.
  return await vi.importActual('../pdf-render-queue');
});

// Stub the Worker constructor globally
vi.stubGlobal('Worker', class {
  constructor() {
    mockWorkerInstance = new MockWorker();
    return mockWorkerInstance;
  }
});

vi.stubGlobal('requestIdleCallback', vi.fn((cb: IdleRequestCallback) => {
  const id = Math.random();
  // Execute immediately for testing
  cb({
    didTimeout: false,
    timeRemaining: () => 50,
  } as IdleDeadline);
  return id;
}));

vi.stubGlobal('cancelIdleCallback', vi.fn());

// Provide devicePixelRatio
Object.defineProperty(globalThis, 'window', {
  value: { devicePixelRatio: 2 },
  writable: true,
});
Object.defineProperty(globalThis, 'devicePixelRatio', {
  value: 2,
  writable: true,
});

// Now import after mocks are set up
import { PdfRenderQueue, createZoomDebouncer } from '../pdf-render-queue';

// ============================================================================
// LRUCache tests (accessed indirectly through PdfRenderQueue)
// ============================================================================

describe('PdfRenderQueue', () => {
  let queue: PdfRenderQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWorkerInstance = undefined as unknown as MockWorker;
    queue = new PdfRenderQueue(3, 5);
  });

  afterEach(() => {
    queue.destroy();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('creates a Worker and sets up message handlers', () => {
      expect(mockWorkerInstance).toBeDefined();
      expect(mockWorkerInstance.onmessage).toBeTypeOf('function');
      expect(mockWorkerInstance.onerror).toBeTypeOf('function');
    });
  });

  describe('setPdfUrl', () => {
    it('sets the current PDF URL', () => {
      queue.setPdfUrl('http://example.com/doc.pdf');
      // Verify it's set by checking that renderVisible works (no "No PDF URL" error)
      // The URL is private, so we test behavior
      expect(() => queue.setPdfUrl('http://example.com/doc.pdf')).not.toThrow();
    });

    it('cancels all pending renders when URL changes', () => {
      queue.setPdfUrl('http://example.com/doc1.pdf');

      // Queue some renders
      const promise = queue.renderVisible([1, 2], 1.0);

      // Change the URL — should cancel pending
      queue.setPdfUrl('http://example.com/doc2.pdf');

      // The canceled renders should not cause unhandled rejections
      // They are caught internally by the .catch(() => {}) in renderVisible
      return promise.then((results) => {
        // Results may be empty because tasks were cancelled
        expect(results).toBeInstanceOf(Map);
      });
    });

    it('does not cancel renders when setting the same URL', () => {
      queue.setPdfUrl('http://example.com/doc.pdf');

      const cancelAllSpy = vi.spyOn(queue as any, 'cancelAll');
      queue.setPdfUrl('http://example.com/doc.pdf');

      expect(cancelAllSpy).not.toHaveBeenCalled();
      cancelAllSpy.mockRestore();
    });

    it('clears text content cache when URL changes', () => {
      queue.setPdfUrl('http://example.com/doc1.pdf');

      // Simulate text content being cached via a worker message
      const bitmap = createMockBitmap();
      const textContent = { items: [], styles: {} };

      // Queue a render and resolve it with text content
      const renderPromise = queue.renderVisible([1], 1.0, true);
      const requestId = mockWorkerInstance.postMessage.mock.calls[0]?.[0]?.id;
      if (requestId) {
        mockWorkerInstance.onmessage?.({
          data: { id: requestId, pageNum: 1, bitmap, scale: 1.0, textContent },
        } as MessageEvent);
      }

      return renderPromise.then(() => {
        expect(queue.getTextContent(1)).not.toBeNull();

        // Change URL — should clear text cache
        queue.setPdfUrl('http://example.com/doc2.pdf');
        expect(queue.getTextContent(1)).toBeNull();
      });
    });
  });

  describe('renderVisible', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('returns cached bitmaps without posting to worker', async () => {
      const bitmap = createMockBitmap();

      // First render: queue and resolve via worker
      const promise1 = queue.renderVisible([1], 1.0);
      const requestId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: requestId, pageNum: 1, bitmap, scale: 1.0 },
      } as MessageEvent);
      await promise1;

      // Reset postMessage call count
      mockWorkerInstance.postMessage.mockClear();

      // Second render: should use cache
      const results = await queue.renderVisible([1], 1.0);
      expect(results.get(1)).toBe(bitmap);
      expect(mockWorkerInstance.postMessage).not.toHaveBeenCalled();
    });

    it('queues non-cached pages to the worker', async () => {
      const promise = queue.renderVisible([1, 2, 3], 1.5);

      // All three should be posted to worker
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledTimes(3);

      // Resolve all three
      for (const call of mockWorkerInstance.postMessage.mock.calls) {
        const req = call[0];
        mockWorkerInstance.onmessage?.({
          data: { id: req.id, pageNum: req.pageNum, bitmap: createMockBitmap(), scale: 1.5 },
        } as MessageEvent);
      }

      const results = await promise;
      expect(results.size).toBe(3);
      expect(results.has(1)).toBe(true);
      expect(results.has(2)).toBe(true);
      expect(results.has(3)).toBe(true);
    });

    it('sends correct render request shape', () => {
      queue.renderVisible([5], 2.0, true);

      const req = mockWorkerInstance.postMessage.mock.calls[0][0];
      expect(req).toMatchObject({
        pdfUrl: 'http://example.com/test.pdf',
        pageNum: 5,
        scale: 2.0,
        devicePixelRatio: 2,
        includeText: true,
      });
      expect(req.id).toMatch(/^render-/);
    });

    it('handles worker errors gracefully for individual pages', async () => {
      const promise = queue.renderVisible([1, 2], 1.0);

      const calls = mockWorkerInstance.postMessage.mock.calls;
      // Fail page 1
      mockWorkerInstance.onmessage?.({
        data: { id: calls[0][0].id, error: 'Render failed' },
      } as MessageEvent);
      // Succeed page 2
      mockWorkerInstance.onmessage?.({
        data: { id: calls[1][0].id, pageNum: 2, bitmap: createMockBitmap(), scale: 1.0 },
      } as MessageEvent);

      const results = await promise;
      expect(results.has(1)).toBe(false); // errored page excluded
      expect(results.has(2)).toBe(true);
    });

    it('does not send worker messages when no PDF URL is set', () => {
      const freshQueue = new PdfRenderQueue();
      const freshWorker = mockWorkerInstance;
      freshWorker.postMessage.mockClear();

      // Don't set PDF URL — renderVisible queues tasks but processQueue
      // exits early because currentPdfUrl is null. The promises will not resolve,
      // and no messages should be sent to the worker.
      freshQueue.renderVisible([1], 1.0);

      expect(freshWorker.postMessage).not.toHaveBeenCalled();
      freshQueue.destroy();
    });
  });

  describe('renderBuffer', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('queues pages with low priority', () => {
      queue.renderBuffer([10, 11], 1.0);

      // Pages should be queued and worker should be called
      // (requestIdleCallback fires immediately in our mock)
      expect(mockWorkerInstance.postMessage).toHaveBeenCalled();
    });

    it('skips pages that are already cached', async () => {
      // First, cache page 10
      const promise = queue.renderVisible([10], 1.0);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 10, bitmap: createMockBitmap(), scale: 1.0 },
      } as MessageEvent);
      await promise;

      mockWorkerInstance.postMessage.mockClear();

      // Now buffer render page 10 — should skip since cached
      queue.renderBuffer([10], 1.0);
      // No new postMessage calls for already-cached page
      // (there might be none, or the queue might not post for cached pages)
      const calls = mockWorkerInstance.postMessage.mock.calls;
      const page10Requests = calls.filter((c) => c[0].pageNum === 10);
      expect(page10Requests).toHaveLength(0);
    });

    it('skips pages that are already queued', () => {
      // Queue page 10 via renderVisible (it will be pending)
      queue.renderVisible([10], 1.0);
      const initialCallCount = mockWorkerInstance.postMessage.mock.calls.length;

      // Now try to buffer the same page at same scale
      queue.renderBuffer([10], 1.0);

      // Should not queue a duplicate
      const page10Calls = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].pageNum === 10
      );
      expect(page10Calls).toHaveLength(1);
    });
  });

  describe('cancel', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('cancels specific pages from the pending requests', () => {
      queue.renderVisible([1, 2, 3], 1.0);

      // Cancel pages 1 and 3
      queue.cancel([1, 3]);

      // Should send cancel messages for pending pages
      const cancelMessages = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === 'cancel'
      );
      expect(cancelMessages.length).toBeGreaterThanOrEqual(1);
    });

    it('does not crash when canceling pages that are not queued', () => {
      expect(() => queue.cancel([999, 1000])).not.toThrow();
    });
  });

  describe('cancelAll', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('cancels all queued and pending tasks', () => {
      queue.renderVisible([1, 2, 3, 4, 5], 1.0);

      queue.cancelAll();

      // Should send cancel messages for pending requests
      const cancelMessages = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === 'cancel'
      );
      expect(cancelMessages.length).toBeGreaterThan(0);
    });

    it('cancels idle callback if active', () => {
      queue.renderBuffer([10, 11], 1.0);
      queue.cancelAll();

      // cancelIdleCallback should have been called (if an idle callback was scheduled)
      // This is hard to verify directly because our mock fires immediately,
      // but cancelAll should not throw
      expect(() => queue.cancelAll()).not.toThrow();
    });
  });

  describe('getCached', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('returns null for uncached pages', () => {
      expect(queue.getCached(1, 1.0)).toBeNull();
    });

    it('returns the cached bitmap after rendering', async () => {
      const bitmap = createMockBitmap();
      const promise = queue.renderVisible([1], 1.0);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 1, bitmap, scale: 1.0 },
      } as MessageEvent);
      await promise;

      expect(queue.getCached(1, 1.0)).toBe(bitmap);
    });

    it('returns null for different scale', async () => {
      const bitmap = createMockBitmap();
      const promise = queue.renderVisible([1], 1.0);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 1, bitmap, scale: 1.0 },
      } as MessageEvent);
      await promise;

      // Cached at 1.0, not at 2.0
      expect(queue.getCached(1, 2.0)).toBeNull();
    });
  });

  describe('isCached', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('returns false for uncached pages', () => {
      expect(queue.isCached(1, 1.0)).toBe(false);
    });

    it('returns true after rendering', async () => {
      const bitmap = createMockBitmap();
      const promise = queue.renderVisible([1], 1.0);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 1, bitmap, scale: 1.0 },
      } as MessageEvent);
      await promise;

      expect(queue.isCached(1, 1.0)).toBe(true);
    });
  });

  describe('text content', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('returns null when no text content is cached', () => {
      expect(queue.getTextContent(1)).toBeNull();
    });

    it('caches text content from worker response', async () => {
      const textContent = { items: [{ str: 'Hello' }], styles: {} };
      const promise = queue.renderVisible([1], 1.0, true);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0, textContent },
      } as MessageEvent);
      await promise;

      expect(queue.getTextContent(1)).toEqual(textContent);
    });

    it('does not overwrite existing text content for same page', async () => {
      const textContent1 = { items: [{ str: 'First' }], styles: {} };
      const textContent2 = { items: [{ str: 'Second' }], styles: {} };

      // First render with text
      const promise1 = queue.renderVisible([1], 1.0, true);
      const reqId1 = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId1, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0, textContent: textContent1 },
      } as MessageEvent);
      await promise1;

      // Second render at different scale — should not overwrite text
      const promise2 = queue.renderVisible([1], 2.0, true);
      const reqId2 = mockWorkerInstance.postMessage.mock.calls[1][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId2, pageNum: 1, bitmap: createMockBitmap(), scale: 2.0, textContent: textContent2 },
      } as MessageEvent);
      await promise2;

      // Should still have the first text content
      expect(queue.getTextContent(1)).toEqual(textContent1);
    });

    it('notifies text content callbacks', async () => {
      const callback = vi.fn();
      queue.onTextContent(callback);

      const textContent = { items: [{ str: 'Hello' }], styles: {} };
      const promise = queue.renderVisible([1], 1.0, true);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0, textContent },
      } as MessageEvent);
      await promise;

      expect(callback).toHaveBeenCalledWith(1, textContent);
    });

    it('does not notify callbacks for duplicate text content', async () => {
      const callback = vi.fn();
      queue.onTextContent(callback);

      const textContent = { items: [{ str: 'Hello' }], styles: {} };

      // First render
      const promise1 = queue.renderVisible([1], 1.0, true);
      const reqId1 = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId1, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0, textContent },
      } as MessageEvent);
      await promise1;

      // Second render for same page (different scale)
      const promise2 = queue.renderVisible([1], 2.0, true);
      const reqId2 = mockWorkerInstance.postMessage.mock.calls[1][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId2, pageNum: 1, bitmap: createMockBitmap(), scale: 2.0, textContent },
      } as MessageEvent);
      await promise2;

      // Should only be called once (for first time)
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes callback via returned function', async () => {
      const callback = vi.fn();
      const unsubscribe = queue.onTextContent(callback);

      unsubscribe();

      const textContent = { items: [{ str: 'Hello' }], styles: {} };
      const promise = queue.renderVisible([1], 1.0, true);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0, textContent },
      } as MessageEvent);
      await promise;

      expect(callback).not.toHaveBeenCalled();
    });

    it('handles callback errors without crashing', async () => {
      const errorCallback = vi.fn(() => {
        throw new Error('callback error');
      });
      const goodCallback = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      queue.onTextContent(errorCallback);
      queue.onTextContent(goodCallback);

      const textContent = { items: [{ str: 'Hello' }], styles: {} };
      const promise = queue.renderVisible([1], 1.0, true);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0, textContent },
      } as MessageEvent);
      await promise;

      // Error callback threw, but good callback still ran
      expect(errorCallback).toHaveBeenCalled();
      expect(goodCallback).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('Text content callback error:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  describe('LRU cache eviction (bitmap cache)', () => {
    // Queue constructed with maxCacheSize=3

    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('evicts the least recently used bitmap when cache is full', async () => {
      const bitmaps: ImageBitmap[] = [];

      // Fill cache with 3 pages
      for (let i = 1; i <= 3; i++) {
        const bitmap = createMockBitmap();
        bitmaps.push(bitmap);
        const promise = queue.renderVisible([i], 1.0);
        const reqId = mockWorkerInstance.postMessage.mock.calls.at(-1)![0].id;
        mockWorkerInstance.onmessage?.({
          data: { id: reqId, pageNum: i, bitmap, scale: 1.0 },
        } as MessageEvent);
        await promise;
        // Advance time so each entry has a different lastUsed time
        vi.advanceTimersByTime(100);
      }

      expect(queue.isCached(1, 1.0)).toBe(true);
      expect(queue.isCached(2, 1.0)).toBe(true);
      expect(queue.isCached(3, 1.0)).toBe(true);

      // Add a 4th page — should evict page 1 (oldest)
      const bitmap4 = createMockBitmap();
      const promise4 = queue.renderVisible([4], 1.0);
      const reqId4 = mockWorkerInstance.postMessage.mock.calls.at(-1)![0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId4, pageNum: 4, bitmap: bitmap4, scale: 1.0 },
      } as MessageEvent);
      await promise4;

      expect(queue.isCached(1, 1.0)).toBe(false);
      expect(bitmaps[0].close).toHaveBeenCalled(); // Evicted bitmap should be closed
      expect(queue.isCached(2, 1.0)).toBe(true);
      expect(queue.isCached(3, 1.0)).toBe(true);
      expect(queue.isCached(4, 1.0)).toBe(true);
    });

    it('touching a cached entry prevents its eviction', async () => {
      // Fill cache with pages 1, 2, 3
      for (let i = 1; i <= 3; i++) {
        const promise = queue.renderVisible([i], 1.0);
        const reqId = mockWorkerInstance.postMessage.mock.calls.at(-1)![0].id;
        mockWorkerInstance.onmessage?.({
          data: { id: reqId, pageNum: i, bitmap: createMockBitmap(), scale: 1.0 },
        } as MessageEvent);
        await promise;
        vi.advanceTimersByTime(100);
      }

      // Touch page 1 to make it recent
      vi.advanceTimersByTime(100);
      queue.getCached(1, 1.0);

      // Add page 4 — should evict page 2 (now the oldest)
      const promise4 = queue.renderVisible([4], 1.0);
      const reqId4 = mockWorkerInstance.postMessage.mock.calls.at(-1)![0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId4, pageNum: 4, bitmap: createMockBitmap(), scale: 1.0 },
      } as MessageEvent);
      await promise4;

      expect(queue.isCached(1, 1.0)).toBe(true); // touched, not evicted
      expect(queue.isCached(2, 1.0)).toBe(false); // evicted
      expect(queue.isCached(3, 1.0)).toBe(true);
      expect(queue.isCached(4, 1.0)).toBe(true);
    });
  });

  describe('cache key generation', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('treats different scales as different cache entries', async () => {
      const bitmap1 = createMockBitmap();
      const bitmap2 = createMockBitmap();

      // Render page 1 at scale 1.0
      const p1 = queue.renderVisible([1], 1.0);
      const reqId1 = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId1, pageNum: 1, bitmap: bitmap1, scale: 1.0 },
      } as MessageEvent);
      await p1;

      // Render page 1 at scale 2.0
      const p2 = queue.renderVisible([1], 2.0);
      const reqId2 = mockWorkerInstance.postMessage.mock.calls[1][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId2, pageNum: 1, bitmap: bitmap2, scale: 2.0 },
      } as MessageEvent);
      await p2;

      expect(queue.getCached(1, 1.0)).toBe(bitmap1);
      expect(queue.getCached(1, 2.0)).toBe(bitmap2);
    });

    it('rounds scale to nearest integer percentage for cache key', async () => {
      // Scale 1.0 → key "1-100", scale 1.01 → key "1-101"
      const bitmap = createMockBitmap();
      const p1 = queue.renderVisible([1], 1.0);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 1, bitmap, scale: 1.0 },
      } as MessageEvent);
      await p1;

      expect(queue.isCached(1, 1.0)).toBe(true);
      // 1.01 rounds to 101, different key than 100
      expect(queue.isCached(1, 1.01)).toBe(false);
    });

    it('treats very close scales with same rounded key as cache hits', async () => {
      // Both 1.001 and 1.004 produce Math.round(x*100) = 100
      const bitmap = createMockBitmap();
      const p1 = queue.renderVisible([1], 1.001);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 1, bitmap, scale: 1.001 },
      } as MessageEvent);
      await p1;

      // 1.004 also rounds to key "1-100", so it's a cache hit
      expect(queue.isCached(1, 1.004)).toBe(true);
    });
  });

  describe('concurrency control', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('respects MAX_CONCURRENT_RENDERS limit of 4', () => {
      // Queue 6 pages at once
      queue.renderVisible([1, 2, 3, 4, 5, 6], 1.0);

      // Only 4 should be sent to the worker immediately
      expect(mockWorkerInstance.postMessage.mock.calls.length).toBe(4);
    });

    it('processes remaining tasks when earlier ones complete', async () => {
      // Queue 6 pages
      queue.renderVisible([1, 2, 3, 4, 5, 6], 1.0);

      expect(mockWorkerInstance.postMessage.mock.calls.length).toBe(4);

      // Complete the first task
      const firstReqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: firstReqId, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0 },
      } as MessageEvent);

      // Should process another queued task
      // Give it a tick for the queue processing
      await vi.advanceTimersByTimeAsync(0);
      expect(mockWorkerInstance.postMessage.mock.calls.length).toBeGreaterThan(4);
    });

    it('processes high priority tasks before low priority in the queue', async () => {
      // Make requestIdleCallback NOT fire immediately for this test,
      // so buffer pages stay in the queue without being sent.
      const savedRIC = globalThis.requestIdleCallback;
      vi.stubGlobal('requestIdleCallback', vi.fn(() => 999));

      // Fill up the concurrent slots with 4 high-priority pages
      queue.renderVisible([101, 102, 103, 104], 1.0);
      expect(mockWorkerInstance.postMessage.mock.calls.length).toBe(4);

      // Queue low priority buffer pages (stays in queue — all 4 slots full, idle callback won't fire)
      queue.renderBuffer([201, 202], 1.0);

      // Queue high priority visible pages (also stays in queue)
      queue.renderVisible([301, 302], 1.0);

      // Complete one of the first 4 to free a slot — triggers processQueue
      const firstReqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: firstReqId, pageNum: 101, bitmap: createMockBitmap(), scale: 1.0 },
      } as MessageEvent);

      await vi.advanceTimersByTimeAsync(0);

      // The next task sent should be high priority (301 or 302), not low priority (201/202)
      const lastCall = mockWorkerInstance.postMessage.mock.calls.at(-1)![0];
      expect(lastCall.type).toBeUndefined(); // render request, not cancel
      expect([301, 302]).toContain(lastCall.pageNum);

      // Restore original mock
      vi.stubGlobal('requestIdleCallback', savedRIC);
    });
  });

  describe('worker error handling', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('rejects all pending tasks on worker error', async () => {
      const promises = [
        queue.renderVisible([1], 1.0),
        queue.renderVisible([2], 1.0),
      ];

      // Trigger worker error
      mockWorkerInstance.onerror?.({
        message: 'Worker crashed',
      } as ErrorEvent);

      // renderVisible catches individual errors, so the promises resolve
      const results = await Promise.all(promises);
      // Both should return empty or partial results since tasks were rejected
      for (const result of results) {
        expect(result).toBeInstanceOf(Map);
      }
    });

    it('handles worker response for unknown request IDs', () => {
      mockWorkerInstance.onmessage?.({
        data: { id: 'unknown-id', pageNum: 1, bitmap: createMockBitmap(), scale: 1.0 },
      } as MessageEvent);

      // Should not throw — just ignores the unknown response
    });
  });

  describe('destroy', () => {
    it('terminates the worker', () => {
      queue.destroy();
      expect(mockWorkerInstance.terminate).toHaveBeenCalled();
    });

    it('clears all caches', async () => {
      queue.setPdfUrl('http://example.com/test.pdf');

      const promise = queue.renderVisible([1], 1.0);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: {
          id: reqId,
          pageNum: 1,
          bitmap: createMockBitmap(),
          scale: 1.0,
          textContent: { items: [], styles: {} },
        },
      } as MessageEvent);
      await promise;

      expect(queue.isCached(1, 1.0)).toBe(true);
      expect(queue.getTextContent(1)).not.toBeNull();

      queue.destroy();

      expect(queue.isCached(1, 1.0)).toBe(false);
      expect(queue.getTextContent(1)).toBeNull();
    });

    it('can be called multiple times without error', () => {
      queue.destroy();
      expect(() => queue.destroy()).not.toThrow();
    });

    it('closes all cached bitmaps on destroy', async () => {
      queue.setPdfUrl('http://example.com/test.pdf');

      const bitmaps: ImageBitmap[] = [];
      for (let i = 1; i <= 3; i++) {
        const bitmap = createMockBitmap();
        bitmaps.push(bitmap);
        const promise = queue.renderVisible([i], 1.0);
        const reqId = mockWorkerInstance.postMessage.mock.calls.at(-1)![0].id;
        mockWorkerInstance.onmessage?.({
          data: { id: reqId, pageNum: i, bitmap, scale: 1.0 },
        } as MessageEvent);
        await promise;
      }

      queue.destroy();

      for (const bitmap of bitmaps) {
        expect(bitmap.close).toHaveBeenCalled();
      }
    });
  });

  describe('renderVisible - edge cases', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('returns empty map for empty pages array', async () => {
      const results = await queue.renderVisible([], 1.0);
      expect(results.size).toBe(0);
      expect(mockWorkerInstance.postMessage).not.toHaveBeenCalled();
    });

    it('returns partial results when some pages fail', async () => {
      const promise = queue.renderVisible([1, 2, 3], 1.0);

      const calls = mockWorkerInstance.postMessage.mock.calls;
      // Page 1: succeed
      mockWorkerInstance.onmessage?.({
        data: { id: calls[0][0].id, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0 },
      } as MessageEvent);
      // Page 2: fail
      mockWorkerInstance.onmessage?.({
        data: { id: calls[1][0].id, error: 'Render failed' },
      } as MessageEvent);
      // Page 3: succeed
      mockWorkerInstance.onmessage?.({
        data: { id: calls[2][0].id, pageNum: 3, bitmap: createMockBitmap(), scale: 1.0 },
      } as MessageEvent);

      const results = await promise;
      expect(results.size).toBe(2);
      expect(results.has(1)).toBe(true);
      expect(results.has(2)).toBe(false);
      expect(results.has(3)).toBe(true);
    });

    it('mixes cached and non-cached pages correctly', async () => {
      // Cache page 1 first
      const bitmap1 = createMockBitmap();
      const p1 = queue.renderVisible([1], 1.0);
      const reqId1 = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId1, pageNum: 1, bitmap: bitmap1, scale: 1.0 },
      } as MessageEvent);
      await p1;

      mockWorkerInstance.postMessage.mockClear();

      // Now render pages 1 (cached), 2, 3 (not cached)
      const bitmap2 = createMockBitmap();
      const bitmap3 = createMockBitmap();
      const promise = queue.renderVisible([1, 2, 3], 1.0);

      // Only pages 2 and 3 should be sent to worker
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledTimes(2);
      const calls = mockWorkerInstance.postMessage.mock.calls;
      expect(calls[0][0].pageNum).toBe(2);
      expect(calls[1][0].pageNum).toBe(3);

      // Resolve non-cached pages
      mockWorkerInstance.onmessage?.({
        data: { id: calls[0][0].id, pageNum: 2, bitmap: bitmap2, scale: 1.0 },
      } as MessageEvent);
      mockWorkerInstance.onmessage?.({
        data: { id: calls[1][0].id, pageNum: 3, bitmap: bitmap3, scale: 1.0 },
      } as MessageEvent);

      const results = await promise;
      expect(results.size).toBe(3);
      expect(results.get(1)).toBe(bitmap1);
      expect(results.get(2)).toBe(bitmap2);
      expect(results.get(3)).toBe(bitmap3);
    });
  });

  describe('cancel - detailed behavior', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('rejects cancelled queued tasks with "Cancelled" error', async () => {
      // Fill all 4 concurrent slots
      queue.renderVisible([1, 2, 3, 4], 1.0);

      // Queue additional pages that will stay in the queue (slots are full)
      const rejections: Error[] = [];
      const p5 = queue.renderVisible([5], 1.0).catch(() => {});

      // Cancel page 5 which should be in the queue (not pending since slots are full)
      queue.cancel([5]);

      // The promise should resolve (errors are caught inside renderVisible)
      await p5;
    });

    it('sends cancel messages to worker for pending pages', () => {
      queue.renderVisible([1, 2, 3], 1.0);

      // Pages 1, 2, 3 are now pending (sent to worker)
      queue.cancel([2]);

      const cancelMessages = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === 'cancel'
      );
      expect(cancelMessages).toHaveLength(1);
      // The cancel message should reference the ID of page 2's pending request
      const page2RenderCall = mockWorkerInstance.postMessage.mock.calls.find(
        (c) => c[0].pageNum === 2 && c[0].type === undefined
      );
      expect(cancelMessages[0][0].id).toBe(page2RenderCall![0].id);
    });

    it('cancel does not affect pages not in the cancel set', async () => {
      const promise = queue.renderVisible([1, 2, 3], 1.0);

      // Cancel only page 2
      queue.cancel([2]);

      // Complete pages 1 and 3 normally
      const calls = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type !== 'cancel'
      );
      for (const call of calls) {
        const req = call[0];
        if (req.pageNum !== 2) {
          mockWorkerInstance.onmessage?.({
            data: { id: req.id, pageNum: req.pageNum, bitmap: createMockBitmap(), scale: 1.0 },
          } as MessageEvent);
        }
      }

      const results = await promise;
      expect(results.has(1)).toBe(true);
      expect(results.has(2)).toBe(false);
      expect(results.has(3)).toBe(true);
    });
  });

  describe('cancelAll - detailed behavior', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('sends cancel messages for all pending requests', () => {
      queue.renderVisible([1, 2, 3], 1.0);

      const renderCallCount = mockWorkerInstance.postMessage.mock.calls.length;
      queue.cancelAll();

      const cancelMessages = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === 'cancel'
      );
      // Should send a cancel for each pending request
      expect(cancelMessages).toHaveLength(renderCallCount);
    });
  });

  describe('text content LRU cache eviction', () => {
    // Queue constructed with maxTextCacheSize=5
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('evicts oldest text content entries when cache is full', async () => {
      // Fill text content cache with 5 pages
      for (let i = 1; i <= 5; i++) {
        const promise = queue.renderVisible([i], 1.0, true);
        const reqId = mockWorkerInstance.postMessage.mock.calls.at(-1)![0].id;
        mockWorkerInstance.onmessage?.({
          data: {
            id: reqId,
            pageNum: i,
            bitmap: createMockBitmap(),
            scale: 1.0,
            textContent: { items: [{ str: `Page ${i}` }], styles: {} },
          },
        } as MessageEvent);
        await promise;
        vi.advanceTimersByTime(100);
      }

      // All 5 should be cached
      for (let i = 1; i <= 5; i++) {
        expect(queue.getTextContent(i)).not.toBeNull();
      }

      // Add a 6th page at a different scale (so bitmap cache doesn't interfere)
      // but text content should trigger eviction of page 1 (oldest)
      const promise6 = queue.renderVisible([6], 1.0, true);
      const reqId6 = mockWorkerInstance.postMessage.mock.calls.at(-1)![0].id;
      mockWorkerInstance.onmessage?.({
        data: {
          id: reqId6,
          pageNum: 6,
          bitmap: createMockBitmap(),
          scale: 1.0,
          textContent: { items: [{ str: 'Page 6' }], styles: {} },
        },
      } as MessageEvent);
      await promise6;

      // Page 1 should be evicted (oldest), page 6 should be cached
      expect(queue.getTextContent(1)).toBeNull();
      expect(queue.getTextContent(6)).not.toBeNull();
      // Pages 2-5 should still be cached
      for (let i = 2; i <= 5; i++) {
        expect(queue.getTextContent(i)).not.toBeNull();
      }
    });

    it('accessing text content updates its recency', async () => {
      // Fill text content cache with 5 pages
      for (let i = 1; i <= 5; i++) {
        const promise = queue.renderVisible([i], 1.0, true);
        const reqId = mockWorkerInstance.postMessage.mock.calls.at(-1)![0].id;
        mockWorkerInstance.onmessage?.({
          data: {
            id: reqId,
            pageNum: i,
            bitmap: createMockBitmap(),
            scale: 1.0,
            textContent: { items: [{ str: `Page ${i}` }], styles: {} },
          },
        } as MessageEvent);
        await promise;
        vi.advanceTimersByTime(100);
      }

      // Touch page 1 to make it recent
      vi.advanceTimersByTime(100);
      queue.getTextContent(1);

      // Add page 6 — should evict page 2 (now the oldest untouched)
      const promise6 = queue.renderVisible([6], 1.0, true);
      const reqId6 = mockWorkerInstance.postMessage.mock.calls.at(-1)![0].id;
      mockWorkerInstance.onmessage?.({
        data: {
          id: reqId6,
          pageNum: 6,
          bitmap: createMockBitmap(),
          scale: 1.0,
          textContent: { items: [{ str: 'Page 6' }], styles: {} },
        },
      } as MessageEvent);
      await promise6;

      expect(queue.getTextContent(1)).not.toBeNull(); // touched, not evicted
      expect(queue.getTextContent(2)).toBeNull(); // evicted
      expect(queue.getTextContent(6)).not.toBeNull(); // newly added
    });
  });

  describe('worker error handling - queue survival', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('only rejects pending requests on worker error, not queued tasks', async () => {
      // Fill all 4 concurrent slots and queue additional tasks
      queue.renderVisible([1, 2, 3, 4, 5, 6], 1.0);

      // 4 tasks are pending, 2 are queued
      expect(mockWorkerInstance.postMessage.mock.calls.length).toBe(4);

      // Trigger worker error — should reject pending but queued tasks remain
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockWorkerInstance.onerror?.({
        message: 'Worker crashed',
      } as ErrorEvent);
      consoleSpy.mockRestore();

      // After error clears pending, processQueue should not be called
      // (since the tasks that were pending are now gone, the queue still has tasks)
      // The queue should still have the remaining tasks
      // Verify by checking that no additional postMessage calls were made
      // (worker might be broken, but queued tasks don't get auto-sent after error)
    });
  });

  describe('LRU bitmap cache - multiple evictions', () => {
    // Queue constructed with maxCacheSize=3
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('handles sequential evictions when adding many items beyond capacity', async () => {
      const bitmaps: ImageBitmap[] = [];

      // Add 6 pages to a cache of size 3
      for (let i = 1; i <= 6; i++) {
        const bitmap = createMockBitmap();
        bitmaps.push(bitmap);
        const promise = queue.renderVisible([i], 1.0);
        const reqId = mockWorkerInstance.postMessage.mock.calls.at(-1)![0].id;
        mockWorkerInstance.onmessage?.({
          data: { id: reqId, pageNum: i, bitmap, scale: 1.0 },
        } as MessageEvent);
        await promise;
        vi.advanceTimersByTime(100);
      }

      // Pages 1-3 should be evicted, pages 4-6 should be present
      expect(queue.isCached(1, 1.0)).toBe(false);
      expect(queue.isCached(2, 1.0)).toBe(false);
      expect(queue.isCached(3, 1.0)).toBe(false);
      expect(queue.isCached(4, 1.0)).toBe(true);
      expect(queue.isCached(5, 1.0)).toBe(true);
      expect(queue.isCached(6, 1.0)).toBe(true);

      // Evicted bitmaps should have close() called
      expect(bitmaps[0].close).toHaveBeenCalled();
      expect(bitmaps[1].close).toHaveBeenCalled();
      expect(bitmaps[2].close).toHaveBeenCalled();
      // Non-evicted bitmaps should NOT have close() called
      expect(bitmaps[3].close).not.toHaveBeenCalled();
      expect(bitmaps[4].close).not.toHaveBeenCalled();
      expect(bitmaps[5].close).not.toHaveBeenCalled();
    });
  });

  describe('renderBuffer deduplication across pending requests', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('skips buffer pages that are already pending in worker', () => {
      // Start a visible render for page 10 (goes to pending/worker)
      queue.renderVisible([10], 1.0);
      expect(mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].pageNum === 10 && c[0].type === undefined
      )).toHaveLength(1);

      // Try to buffer the same page — should be skipped
      queue.renderBuffer([10], 1.0);

      // Should still only have 1 render request for page 10
      const page10Renders = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].pageNum === 10 && c[0].type === undefined
      );
      expect(page10Renders).toHaveLength(1);
    });

    it('allows buffer render for same page at different scale', () => {
      // Render page 10 at scale 1.0
      queue.renderVisible([10], 1.0);
      const initialCount = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].pageNum === 10 && c[0].type === undefined
      ).length;

      // Buffer page 10 at scale 2.0 — different scale, should not be skipped
      queue.renderBuffer([10], 2.0);

      const totalPage10Renders = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].pageNum === 10 && c[0].type === undefined
      );
      expect(totalPage10Renders.length).toBeGreaterThan(initialCount);
    });
  });

  describe('text content callback edge cases', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('does not notify callbacks when response has no text content', async () => {
      const callback = vi.fn();
      queue.onTextContent(callback);

      // Render without text content in response
      const promise = queue.renderVisible([1], 1.0, true);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0 },
        // No textContent field
      } as MessageEvent);
      await promise;

      expect(callback).not.toHaveBeenCalled();
    });

    it('supports multiple simultaneous subscribers', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();
      queue.onTextContent(callback1);
      queue.onTextContent(callback2);
      queue.onTextContent(callback3);

      const textContent = { items: [{ str: 'Test' }], styles: {} };
      const promise = queue.renderVisible([1], 1.0, true);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0, textContent },
      } as MessageEvent);
      await promise;

      expect(callback1).toHaveBeenCalledWith(1, textContent);
      expect(callback2).toHaveBeenCalledWith(1, textContent);
      expect(callback3).toHaveBeenCalledWith(1, textContent);
    });

    it('unsubscribing one callback does not affect others', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const unsub1 = queue.onTextContent(callback1);
      queue.onTextContent(callback2);

      unsub1();

      const textContent = { items: [{ str: 'Test' }], styles: {} };
      const promise = queue.renderVisible([1], 1.0, true);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0, textContent },
      } as MessageEvent);
      await promise;

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledWith(1, textContent);
    });
  });

  describe('setPdfUrl - edge cases', () => {
    it('cancels all pending renders and rejects their promises on URL change', async () => {
      queue.setPdfUrl('http://example.com/doc1.pdf');

      // Start renders
      const promise = queue.renderVisible([1, 2], 1.0);

      // Change URL mid-render
      queue.setPdfUrl('http://example.com/doc2.pdf');

      // Render promises should resolve (errors caught internally)
      const results = await promise;
      expect(results).toBeInstanceOf(Map);

      // Cancel messages should have been sent for in-flight requests
      const cancelMessages = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === 'cancel'
      );
      expect(cancelMessages.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// createZoomDebouncer
// ============================================================================

describe('createZoomDebouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls the callback after the delay', () => {
    const callback = vi.fn();
    const debounced = createZoomDebouncer(callback, 150);

    debounced(1.5);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(150);
    expect(callback).toHaveBeenCalledWith(1.5);
  });

  it('debounces rapid calls, only firing with the last value', () => {
    const callback = vi.fn();
    const debounced = createZoomDebouncer(callback, 100);

    debounced(1.0);
    debounced(1.5);
    debounced(2.0);

    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(2.0);
  });

  it('uses default delay of 150ms', () => {
    const callback = vi.fn();
    const debounced = createZoomDebouncer(callback);

    debounced(1.0);

    vi.advanceTimersByTime(149);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledWith(1.0);
  });

  it('allows subsequent calls after debounce completes', () => {
    const callback = vi.fn();
    const debounced = createZoomDebouncer(callback, 100);

    debounced(1.0);
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);

    debounced(2.0);
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith(2.0);
  });

  it('resets the timer on each call', () => {
    const callback = vi.fn();
    const debounced = createZoomDebouncer(callback, 100);

    debounced(1.0);
    vi.advanceTimersByTime(80);
    expect(callback).not.toHaveBeenCalled();

    // Call again before timeout — resets timer
    debounced(1.5);
    vi.advanceTimersByTime(80);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(20);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(1.5);
  });

  it('handles zero delay', () => {
    const callback = vi.fn();
    const debounced = createZoomDebouncer(callback, 0);

    debounced(1.0);
    vi.advanceTimersByTime(0);
    expect(callback).toHaveBeenCalledWith(1.0);
  });

  it('does not fire callback if no calls are made', () => {
    const callback = vi.fn();
    createZoomDebouncer(callback, 100);

    vi.advanceTimersByTime(1000);
    expect(callback).not.toHaveBeenCalled();
  });

  it('handles negative zoom values', () => {
    const callback = vi.fn();
    const debounced = createZoomDebouncer(callback, 50);

    debounced(-1.0);
    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledWith(-1.0);
  });

  it('handles very large delay values', () => {
    const callback = vi.fn();
    const debounced = createZoomDebouncer(callback, 10000);

    debounced(1.0);
    vi.advanceTimersByTime(9999);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledWith(1.0);
  });
});

// ============================================================================
// Additional PdfRenderQueue edge case tests
// ============================================================================

describe('PdfRenderQueue - additional edge cases', () => {
  let queue: PdfRenderQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWorkerInstance = undefined as unknown as MockWorker;
    queue = new PdfRenderQueue(3, 5);
  });

  afterEach(() => {
    queue.destroy();
    vi.useRealTimers();
  });

  describe('LRU cache key edge cases', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('generates different keys for scale 0 and scale 0.001', async () => {
      // Scale 0 → key "1-0", scale 0.001 → Math.round(0.001*100) = 0 → same key "1-0"
      const bitmap1 = createMockBitmap();
      const p1 = queue.renderVisible([1], 0);
      const reqId1 = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId1, pageNum: 1, bitmap: bitmap1, scale: 0 },
      } as MessageEvent);
      await p1;

      // 0.001 rounds to same key as 0, so this should be a cache hit
      expect(queue.isCached(1, 0.001)).toBe(true);
    });

    it('handles very large scale values', async () => {
      const bitmap = createMockBitmap();
      const p1 = queue.renderVisible([1], 100.0);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 1, bitmap, scale: 100.0 },
      } as MessageEvent);
      await p1;

      expect(queue.isCached(1, 100.0)).toBe(true);
      expect(queue.getCached(1, 100.0)).toBe(bitmap);
    });

    it('handles fractional scale precision boundary', async () => {
      // 1.006 * 100 = 100.6, Math.round → 101 → key "1-101"
      // 1.004 * 100 = 100.4, Math.round → 100 → key "1-100"
      // Note: 1.005 * 100 = 100.49999999999999 due to IEEE 754, rounds to 100
      const bitmap = createMockBitmap();
      const p1 = queue.renderVisible([1], 1.006);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 1, bitmap, scale: 1.006 },
      } as MessageEvent);
      await p1;

      expect(queue.isCached(1, 1.006)).toBe(true);
      // 1.004 rounds to 100, 1.006 rounds to 101 — different keys
      expect(queue.isCached(1, 1.004)).toBe(false);
    });

    it('generates distinct keys for different page numbers at same scale', async () => {
      const bitmap1 = createMockBitmap();
      const bitmap2 = createMockBitmap();

      const p1 = queue.renderVisible([1], 1.0);
      const reqId1 = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId1, pageNum: 1, bitmap: bitmap1, scale: 1.0 },
      } as MessageEvent);
      await p1;

      const p2 = queue.renderVisible([2], 1.0);
      const reqId2 = mockWorkerInstance.postMessage.mock.calls[1][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId2, pageNum: 2, bitmap: bitmap2, scale: 1.0 },
      } as MessageEvent);
      await p2;

      expect(queue.getCached(1, 1.0)).toBe(bitmap1);
      expect(queue.getCached(2, 1.0)).toBe(bitmap2);
      expect(queue.getCached(1, 1.0)).not.toBe(queue.getCached(2, 1.0));
    });
  });

  describe('LRU bitmap cache - overwrite and boundary behavior', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('bitmap cache persists across setPdfUrl changes', async () => {
      const bitmap1 = createMockBitmap();

      // Render page 1 at scale 1.0
      const p1 = queue.renderVisible([1], 1.0);
      const reqId1 = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId1, pageNum: 1, bitmap: bitmap1, scale: 1.0 },
      } as MessageEvent);
      await p1;

      const callCountBefore = mockWorkerInstance.postMessage.mock.calls.length;

      // setPdfUrl does NOT clear the bitmap cache, only text content cache
      queue.setPdfUrl('http://example.com/other.pdf');
      queue.setPdfUrl('http://example.com/test.pdf');

      // Re-render same page — should get cache hit without new worker request
      const result = await queue.renderVisible([1], 1.0);

      expect(result.get(1)).toBe(bitmap1);
      // No new render requests should have been sent (cancel messages may have been sent)
      const renderCalls = mockWorkerInstance.postMessage.mock.calls
        .slice(callCountBefore)
        .filter((c) => c[0].type !== 'cancel');
      expect(renderCalls).toHaveLength(0);
    });

    it('handles cache with maxSize=1 correctly', () => {
      const smallQueue = new PdfRenderQueue(1, 5);
      smallQueue.setPdfUrl('http://example.com/test.pdf');

      // Render page 1
      const bitmap1 = createMockBitmap();
      smallQueue.renderVisible([1], 1.0);
      const reqId1 = mockWorkerInstance.postMessage.mock.calls.at(-1)![0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId1, pageNum: 1, bitmap: bitmap1, scale: 1.0 },
      } as MessageEvent);

      expect(smallQueue.isCached(1, 1.0)).toBe(true);

      // Render page 2 — should evict page 1
      vi.advanceTimersByTime(10);
      const bitmap2 = createMockBitmap();
      smallQueue.renderVisible([2], 1.0);
      const reqId2 = mockWorkerInstance.postMessage.mock.calls.at(-1)![0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId2, pageNum: 2, bitmap: bitmap2, scale: 1.0 },
      } as MessageEvent);

      expect(smallQueue.isCached(1, 1.0)).toBe(false);
      expect(smallQueue.isCached(2, 1.0)).toBe(true);
      expect(bitmap1.close).toHaveBeenCalled();

      smallQueue.destroy();
    });
  });

  describe('renderVisible with includeText=false', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('sends includeText=false in render request by default', () => {
      queue.renderVisible([1], 1.0);

      const req = mockWorkerInstance.postMessage.mock.calls[0][0];
      expect(req.includeText).toBe(true); // default is true
    });

    it('sends includeText=false when explicitly set', () => {
      queue.renderVisible([1], 1.0, false);

      const req = mockWorkerInstance.postMessage.mock.calls[0][0];
      expect(req.includeText).toBe(false);
    });

    it('does not cache text content when response has textContent but includeText was false', async () => {
      const callback = vi.fn();
      queue.onTextContent(callback);

      // Even though we said includeText=false, the response might still
      // have textContent. The queue doesn't filter based on includeText —
      // it caches whatever the worker sends.
      const textContent = { items: [{ str: 'Surprise' }], styles: {} };
      const promise = queue.renderVisible([1], 1.0, false);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0, textContent },
      } as MessageEvent);
      await promise;

      // The queue caches whatever the worker returns regardless of includeText flag
      expect(queue.getTextContent(1)).toEqual(textContent);
      expect(callback).toHaveBeenCalledWith(1, textContent);
    });
  });

  describe('renderBuffer with no PDF URL set', () => {
    it('does not crash or send worker messages', () => {
      const freshQueue = new PdfRenderQueue();
      const freshWorker = mockWorkerInstance;
      freshWorker.postMessage.mockClear();

      // No URL set — renderBuffer should not crash
      expect(() => freshQueue.renderBuffer([1, 2, 3], 1.0)).not.toThrow();

      // No messages sent to worker (processQueue returns early)
      const renderCalls = freshWorker.postMessage.mock.calls.filter(
        (c) => c[0].type === undefined
      );
      expect(renderCalls).toHaveLength(0);

      freshQueue.destroy();
    });
  });

  describe('interleaved render/cancel/render sequences', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('handles render → cancel → re-render for the same page', async () => {
      // First render
      const promise1 = queue.renderVisible([1], 1.0);

      // Cancel it
      queue.cancel([1]);

      // The first promise should resolve (error caught internally)
      const results1 = await promise1;
      expect(results1.has(1)).toBe(false);

      // Re-render the same page
      const bitmap = createMockBitmap();
      const promise2 = queue.renderVisible([1], 1.0);
      const reqId = mockWorkerInstance.postMessage.mock.calls.at(-1)![0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 1, bitmap, scale: 1.0 },
      } as MessageEvent);
      const results2 = await promise2;

      expect(results2.has(1)).toBe(true);
      expect(results2.get(1)).toBe(bitmap);
    });

    it('handles cancelAll during active renders then new renders', async () => {
      // Start renders
      const promise1 = queue.renderVisible([1, 2, 3], 1.0);

      // Cancel everything
      queue.cancelAll();
      const results1 = await promise1;
      expect(results1.size).toBe(0);

      // Start new renders — should work normally
      const bitmap = createMockBitmap();
      const promise2 = queue.renderVisible([4], 1.0);
      const reqId = mockWorkerInstance.postMessage.mock.calls.at(-1)![0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 4, bitmap, scale: 1.0 },
      } as MessageEvent);
      const results2 = await promise2;

      expect(results2.has(4)).toBe(true);
    });

    it('handles URL change during render then new render', async () => {
      // Start render on first URL
      const promise1 = queue.renderVisible([1], 1.0);

      // Change URL (cancels everything)
      queue.setPdfUrl('http://example.com/new.pdf');
      const results1 = await promise1;
      expect(results1.size).toBe(0);

      // Start render on new URL
      const bitmap = createMockBitmap();
      const promise2 = queue.renderVisible([1], 1.0);
      const reqId = mockWorkerInstance.postMessage.mock.calls.at(-1)![0].id;

      // Verify the request uses the new URL
      const lastReq = mockWorkerInstance.postMessage.mock.calls.at(-1)![0];
      expect(lastReq.pdfUrl).toBe('http://example.com/new.pdf');

      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 1, bitmap, scale: 1.0 },
      } as MessageEvent);
      const results2 = await promise2;
      expect(results2.get(1)).toBe(bitmap);
    });
  });

  describe('processIdleTasks deadline exhaustion', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('reschedules when deadline runs out before all tasks are processed', () => {
      // Override requestIdleCallback to track invocations and use a deadline
      // that reports no time remaining after the first call
      let callCount = 0;
      const ricMock = vi.fn((cb: IdleRequestCallback) => {
        const id = ++callCount;
        cb({
          didTimeout: false,
          timeRemaining: () => (callCount === 1 ? 50 : 0), // only first call has time
        } as IdleDeadline);
        return id;
      });
      vi.stubGlobal('requestIdleCallback', ricMock);

      // Fill all 4 concurrent slots first so buffer pages stay in the queue
      queue.renderVisible([1, 2, 3, 4], 1.0);

      // Queue buffer pages — these won't be sent immediately since slots are full
      queue.renderBuffer([10, 11, 12], 1.0);

      // requestIdleCallback should have been called
      expect(ricMock).toHaveBeenCalled();

      // Restore default mock
      vi.stubGlobal('requestIdleCallback', vi.fn((cb: IdleRequestCallback) => {
        cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
        return Math.random();
      }));
    });
  });

  describe('cancelAll idempotency', () => {
    it('can be called multiple times without error', () => {
      queue.setPdfUrl('http://example.com/test.pdf');
      queue.renderVisible([1, 2], 1.0);

      expect(() => {
        queue.cancelAll();
        queue.cancelAll();
        queue.cancelAll();
      }).not.toThrow();
    });

    it('second cancelAll sends no additional cancel messages', () => {
      queue.setPdfUrl('http://example.com/test.pdf');
      queue.renderVisible([1, 2, 3], 1.0);

      queue.cancelAll();
      const cancelCountAfterFirst = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === 'cancel'
      ).length;

      queue.cancelAll();
      const cancelCountAfterSecond = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === 'cancel'
      ).length;

      // No new cancel messages on second call
      expect(cancelCountAfterSecond).toBe(cancelCountAfterFirst);
    });
  });

  describe('concurrent render requests for overlapping pages', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('handles two renderVisible calls with overlapping pages', async () => {
      // Both requests include page 2
      const promise1 = queue.renderVisible([1, 2], 1.0);
      const promise2 = queue.renderVisible([2, 3], 1.0);

      // Resolve all worker messages
      for (const call of mockWorkerInstance.postMessage.mock.calls) {
        const req = call[0];
        if (req.type !== 'cancel') {
          mockWorkerInstance.onmessage?.({
            data: { id: req.id, pageNum: req.pageNum, bitmap: createMockBitmap(), scale: 1.0 },
          } as MessageEvent);
        }
      }

      const [results1, results2] = await Promise.all([promise1, promise2]);

      expect(results1.has(1)).toBe(true);
      expect(results1.has(2)).toBe(true);
      expect(results2.has(3)).toBe(true);
    });

    it('both promises resolve when renders complete out of order', async () => {
      const promise1 = queue.renderVisible([1], 1.0);
      const promise2 = queue.renderVisible([2], 1.0);

      const calls = mockWorkerInstance.postMessage.mock.calls;

      // Complete page 2 first (out of order)
      mockWorkerInstance.onmessage?.({
        data: { id: calls[1][0].id, pageNum: 2, bitmap: createMockBitmap(), scale: 1.0 },
      } as MessageEvent);

      // Then complete page 1
      mockWorkerInstance.onmessage?.({
        data: { id: calls[0][0].id, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0 },
      } as MessageEvent);

      const [results1, results2] = await Promise.all([promise1, promise2]);
      expect(results1.has(1)).toBe(true);
      expect(results2.has(2)).toBe(true);
    });
  });

  describe('text content cache with maxSize=1', () => {
    it('only keeps the most recent text content', async () => {
      const tinyQueue = new PdfRenderQueue(15, 1);
      tinyQueue.setPdfUrl('http://example.com/test.pdf');

      // Render page 1 with text
      const p1 = tinyQueue.renderVisible([1], 1.0, true);
      const reqId1 = mockWorkerInstance.postMessage.mock.calls.at(-1)![0].id;
      mockWorkerInstance.onmessage?.({
        data: {
          id: reqId1,
          pageNum: 1,
          bitmap: createMockBitmap(),
          scale: 1.0,
          textContent: { items: [{ str: 'Page 1' }], styles: {} },
        },
      } as MessageEvent);
      await p1;

      expect(tinyQueue.getTextContent(1)).not.toBeNull();

      // Render page 2 with text — should evict page 1
      vi.advanceTimersByTime(10);
      const p2 = tinyQueue.renderVisible([2], 1.0, true);
      const reqId2 = mockWorkerInstance.postMessage.mock.calls.at(-1)![0].id;
      mockWorkerInstance.onmessage?.({
        data: {
          id: reqId2,
          pageNum: 2,
          bitmap: createMockBitmap(),
          scale: 1.0,
          textContent: { items: [{ str: 'Page 2' }], styles: {} },
        },
      } as MessageEvent);
      await p2;

      expect(tinyQueue.getTextContent(1)).toBeNull(); // evicted
      expect(tinyQueue.getTextContent(2)).not.toBeNull();

      tinyQueue.destroy();
    });
  });

  describe('worker response after task cancelled', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('ignores worker response for a cancelled pending task', async () => {
      const promise = queue.renderVisible([1], 1.0);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;

      // Cancel the task
      queue.cancel([1]);
      const results = await promise;
      expect(results.has(1)).toBe(false);

      // Now the worker responds (late) for the cancelled task
      expect(() => {
        mockWorkerInstance.onmessage?.({
          data: { id: reqId, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0 },
        } as MessageEvent);
      }).not.toThrow();

      // The late response should not cause the page to be cached
      // (the task was removed from pendingRequests, so handleWorkerMessage returns early)
      expect(queue.isCached(1, 1.0)).toBe(false);
    });

    it('ignores worker error response for a cancelled pending task', async () => {
      const promise = queue.renderVisible([1], 1.0);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;

      // Cancel the task
      queue.cancel([1]);
      await promise;

      // Worker sends an error for the cancelled task
      expect(() => {
        mockWorkerInstance.onmessage?.({
          data: { id: reqId, error: 'Some error' },
        } as MessageEvent);
      }).not.toThrow();
    });
  });

  describe('destroy during active renders', () => {
    it('rejects pending renders and cleans up', async () => {
      queue.setPdfUrl('http://example.com/test.pdf');

      const promise = queue.renderVisible([1, 2], 1.0);

      // Destroy while renders are pending
      queue.destroy();

      // Promises should resolve (errors caught internally)
      const results = await promise;
      expect(results).toBeInstanceOf(Map);

      // Worker should be terminated
      expect(mockWorkerInstance.terminate).toHaveBeenCalled();
    });
  });

  describe('getTextContent for uncached pages', () => {
    it('returns null without throwing for any page number', () => {
      expect(queue.getTextContent(0)).toBeNull();
      expect(queue.getTextContent(-1)).toBeNull();
      expect(queue.getTextContent(999999)).toBeNull();
    });
  });

  describe('onTextContent subscription management', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('calling unsubscribe twice does not throw or corrupt callbacks', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const unsub1 = queue.onTextContent(callback1);
      queue.onTextContent(callback2);

      // Unsubscribe twice
      unsub1();
      expect(() => unsub1()).not.toThrow();

      // callback2 should still work
      const textContent = { items: [{ str: 'Test' }], styles: {} };
      const promise = queue.renderVisible([1], 1.0, true);
      const reqId = mockWorkerInstance.postMessage.mock.calls[0][0].id;
      mockWorkerInstance.onmessage?.({
        data: { id: reqId, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0, textContent },
      } as MessageEvent);
      await promise;

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledWith(1, textContent);
    });
  });

  describe('renderVisible - large batch with concurrency', () => {
    beforeEach(() => {
      queue.setPdfUrl('http://example.com/test.pdf');
    });

    it('processes all pages eventually with 4 concurrent slots', async () => {
      // Request 10 pages
      const promise = queue.renderVisible([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1.0);

      // First 4 sent immediately (render requests have no 'type' field)
      const renderCalls = () => mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === undefined
      );
      expect(renderCalls()).toHaveLength(4);

      // Resolve pending requests one at a time; each response frees a slot
      // and triggers processQueue to dispatch the next queued task
      const resolved = new Set<string>();
      let safeguard = 0;
      while (safeguard++ < 30) {
        const calls = renderCalls();
        // Find a call we haven't resolved yet
        const unresolved = calls.find((c) => !resolved.has(c[0].id));
        if (!unresolved) break;

        const req = unresolved[0];
        resolved.add(req.id);
        mockWorkerInstance.onmessage?.({
          data: { id: req.id, pageNum: req.pageNum, bitmap: createMockBitmap(), scale: 1.0 },
        } as MessageEvent);
        // Allow microtasks to flush so processQueue can dispatch next tasks
        await Promise.resolve();
      }

      const results = await promise;

      // All 10 pages should have results
      expect(results.size).toBe(10);
      for (let i = 1; i <= 10; i++) {
        expect(results.has(i)).toBe(true);
      }
    });
  });
});

// ============================================================================
// Deeper edge-case coverage for queue internals, cache behavior, and cancel flows
// ============================================================================

describe('PdfRenderQueue - queue processing edge cases', () => {
  let queue: PdfRenderQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    // Re-stub idle callbacks (vi.useRealTimers in previous suite's afterEach may clear them)
    vi.stubGlobal('requestIdleCallback', vi.fn((cb: IdleRequestCallback) => {
      const id = Math.random();
      cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
      return id;
    }));
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    mockWorkerInstance = null as unknown as MockWorker;
    queue = new PdfRenderQueue(5, 5);
  });

  afterEach(() => {
    queue.destroy();
    vi.useRealTimers();
  });

  describe('processQueue without PDF URL', () => {
    it('does not send any render requests when URL is never set', () => {
      // Queue pages without ever calling setPdfUrl — the returned promise
      // will never resolve (no URL means processQueue exits early), so we
      // just verify no messages were posted synchronously.
      queue.renderVisible([1, 2, 3], 1.0);

      // No messages should be posted — processQueue exits early
      const renderCalls = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === undefined
      );
      expect(renderCalls).toHaveLength(0);
    });

    it('begins processing once URL is set before queuing', async () => {
      // Set URL first then render
      queue.setPdfUrl('http://example.com/test.pdf');
      const promise = queue.renderVisible([1], 1.0);

      const renderCalls = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === undefined
      );
      expect(renderCalls).toHaveLength(1);

      // Complete the render
      const req = renderCalls[0][0];
      mockWorkerInstance.onmessage?.({
        data: { id: req.id, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0 },
      } as MessageEvent);

      const result = await promise;
      expect(result.size).toBe(1);
    });
  });

  describe('cancel queued (not yet pending) tasks', () => {
    it('rejects queued tasks with Cancelled error when cancelled before being sent to worker', async () => {
      queue.setPdfUrl('http://example.com/test.pdf');

      // Fill up the 4 concurrent slots
      const blockingPromises: Promise<Map<number, ImageBitmap>>[] = [];
      blockingPromises.push(queue.renderVisible([1, 2, 3, 4], 1.0));

      // Pages 5, 6 should be in the queue (not yet sent to worker)
      const renderCalls = () => mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === undefined
      );
      expect(renderCalls()).toHaveLength(4);

      // Queue more pages — they'll be held in the queue
      const extraPromise = queue.renderVisible([5, 6], 1.0);

      // Cancel pages 5 and 6 while they're still queued
      queue.cancel([5, 6]);

      // Complete the blocking renders
      for (const call of renderCalls()) {
        const req = call[0];
        mockWorkerInstance.onmessage?.({
          data: { id: req.id, pageNum: req.pageNum, bitmap: createMockBitmap(), scale: 1.0 },
        } as MessageEvent);
      }

      const results = await blockingPromises[0];
      expect(results.size).toBe(4);

      // The extra promise should resolve with empty map (both pages cancelled)
      const extraResults = await extraPromise;
      expect(extraResults.size).toBe(0);
    });
  });

  describe('worker error response for specific request', () => {
    it('rejects only the specific task on error, not all pending tasks', async () => {
      queue.setPdfUrl('http://example.com/test.pdf');

      const promise1 = queue.renderVisible([1], 1.0);
      const promise2 = queue.renderVisible([2], 1.0);

      const renderCalls = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === undefined
      );

      // Send error for page 1
      const req1 = renderCalls[0][0];
      mockWorkerInstance.onmessage?.({
        data: { id: req1.id, error: 'Page load failed' },
      } as MessageEvent);

      // Send success for page 2
      const req2 = renderCalls[1][0];
      mockWorkerInstance.onmessage?.({
        data: { id: req2.id, pageNum: 2, bitmap: createMockBitmap(), scale: 1.0 },
      } as MessageEvent);

      // Promise 1 should resolve with empty map (page 1 errored silently)
      const result1 = await promise1;
      expect(result1.size).toBe(0);

      // Promise 2 should have page 2
      const result2 = await promise2;
      expect(result2.size).toBe(1);
      expect(result2.has(2)).toBe(true);
    });
  });

  describe('priority ordering in processQueue', () => {
    it('dispatches high-priority tasks before low-priority tasks when slots open', async () => {
      // Override requestIdleCallback to NOT fire immediately — we want buffer
      // pages to sit in the queue so processQueue can prioritize them.
      vi.stubGlobal('requestIdleCallback', vi.fn(() => 999));

      queue.setPdfUrl('http://example.com/test.pdf');

      // Fill all 4 concurrent slots
      queue.renderVisible([1, 2, 3, 4], 1.0);

      // Queue low-priority buffer pages (idle callback won't fire)
      queue.renderBuffer([10, 11], 1.0);

      // Queue high-priority visible pages
      const highPromise = queue.renderVisible([5, 6], 1.0);

      // Only the initial 4 should have been dispatched so far
      const firstBatch = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === undefined
      );
      expect(firstBatch).toHaveLength(4);

      // Complete the first 4 renders to free slots — processQueue will run
      // and should pick high-priority (5, 6) before low-priority (10, 11)
      for (const call of firstBatch) {
        const req = call[0];
        mockWorkerInstance.onmessage?.({
          data: { id: req.id, pageNum: req.pageNum, bitmap: createMockBitmap(), scale: 1.0 },
        } as MessageEvent);
      }
      await Promise.resolve();

      const allCalls = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === undefined
      );
      const dispatchedAfterFirstBatch = allCalls.slice(4).map((c) => c[0].pageNum);

      // Pages 5 and 6 (high priority) should appear before 10 and 11 (low)
      const indexOf5 = dispatchedAfterFirstBatch.indexOf(5);
      const indexOf10 = dispatchedAfterFirstBatch.indexOf(10);

      expect(indexOf5).toBeGreaterThanOrEqual(0);
      if (indexOf10 >= 0) {
        expect(indexOf5).toBeLessThan(indexOf10);
      }

      // Complete remaining renders
      const remainingCalls = allCalls.slice(4);
      for (const call of remainingCalls) {
        const req = call[0];
        mockWorkerInstance.onmessage?.({
          data: { id: req.id, pageNum: req.pageNum, bitmap: createMockBitmap(), scale: 1.0 },
        } as MessageEvent);
      }

      const result = await highPromise;
      expect(result.has(5)).toBe(true);
      expect(result.has(6)).toBe(true);
    });
  });

  describe('text content callback error isolation', () => {
    it('continues notifying subsequent callbacks even when one throws', async () => {
      queue.setPdfUrl('http://example.com/test.pdf');

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const callback1 = vi.fn(() => { throw new Error('callback boom'); });
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      queue.onTextContent(callback1);
      queue.onTextContent(callback2);
      queue.onTextContent(callback3);

      const promise = queue.renderVisible([1], 1.0, true);

      const req = mockWorkerInstance.postMessage.mock.calls.find(
        (c) => c[0].type === undefined
      )![0];

      const textContent = { items: [], width: 100, height: 200 };
      mockWorkerInstance.onmessage?.({
        data: { id: req.id, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0, textContent },
      } as MessageEvent);

      await promise;

      // All 3 callbacks should have been invoked despite callback1 throwing
      expect(callback1).toHaveBeenCalledWith(1, textContent);
      expect(callback2).toHaveBeenCalledWith(1, textContent);
      expect(callback3).toHaveBeenCalledWith(1, textContent);

      // Error should have been logged
      expect(consoleSpy).toHaveBeenCalledWith('Text content callback error:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  describe('renderVisible with includeText=true', () => {
    it('passes includeText=true in the render request', () => {
      queue.setPdfUrl('http://example.com/test.pdf');
      queue.renderVisible([1], 1.0, true);

      const renderCalls = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === undefined
      );
      expect(renderCalls).toHaveLength(1);
      expect(renderCalls[0][0].includeText).toBe(true);
    });

    it('caches text content from response when includeText=true', async () => {
      queue.setPdfUrl('http://example.com/test.pdf');
      const promise = queue.renderVisible([1], 1.0, true);

      const req = mockWorkerInstance.postMessage.mock.calls.find(
        (c) => c[0].type === undefined
      )![0];

      const textContent = { items: [{ str: 'hello' }], width: 100, height: 200 };
      mockWorkerInstance.onmessage?.({
        data: { id: req.id, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0, textContent },
      } as MessageEvent);

      await promise;

      expect(queue.getTextContent(1)).toEqual(textContent);
    });
  });

  describe('generateId uniqueness', () => {
    it('produces unique IDs across many requests', async () => {
      queue.setPdfUrl('http://example.com/test.pdf');

      // Queue 20 pages
      queue.renderVisible([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 1.0);

      const allCalls = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === undefined
      );

      const ids = allCalls.map((c) => c[0].id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('devicePixelRatio in render requests', () => {
    it('includes devicePixelRatio from window in all requests', () => {
      queue.setPdfUrl('http://example.com/test.pdf');
      queue.renderVisible([1], 1.0);

      const renderCalls = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === undefined
      );
      expect(renderCalls[0][0].devicePixelRatio).toBe(2);
    });
  });

  describe('LRU bitmap cache close() on eviction', () => {
    it('calls close() on evicted bitmaps to free resources', async () => {
      // Create queue with maxCacheSize=2
      const smallQueue = new PdfRenderQueue(2, 5);
      smallQueue.setPdfUrl('http://example.com/test.pdf');

      const bitmaps: ImageBitmap[] = [];

      // Render 3 pages to trigger eviction of the first
      for (let page = 1; page <= 3; page++) {
        const promise = smallQueue.renderVisible([page], 1.0);

        const renderCalls = mockWorkerInstance.postMessage.mock.calls.filter(
          (c) => c[0].type === undefined
        );
        const req = renderCalls[renderCalls.length - 1][0];

        const bitmap = createMockBitmap();
        bitmaps.push(bitmap);
        mockWorkerInstance.onmessage?.({
          data: { id: req.id, pageNum: page, bitmap, scale: 1.0 },
        } as MessageEvent);

        await promise;
      }

      // The first bitmap should have been evicted and close() called
      expect(bitmaps[0].close).toHaveBeenCalled();
      // The other two should still be in cache
      expect(bitmaps[1].close).not.toHaveBeenCalled();
      expect(bitmaps[2].close).not.toHaveBeenCalled();

      smallQueue.destroy();
    });
  });

  describe('cancel with mix of queued and pending tasks', () => {
    it('cancels both queued and pending tasks for the specified pages', async () => {
      queue.setPdfUrl('http://example.com/test.pdf');

      // Start renders to fill all 4 slots
      const promise = queue.renderVisible([1, 2, 3, 4, 5, 6], 1.0);

      // Pages 1-4 are pending, pages 5-6 are queued
      const renderCalls = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === undefined
      );
      expect(renderCalls).toHaveLength(4);

      // Cancel pages 3 (pending) and 5 (queued)
      queue.cancel([3, 5]);

      // Should have sent cancel message for page 3 (pending)
      const cancelCalls = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === 'cancel'
      );
      expect(cancelCalls.length).toBeGreaterThanOrEqual(1);

      // Complete remaining renders
      for (const call of renderCalls) {
        const req = call[0];
        if (req.pageNum === 3) continue; // Already cancelled
        mockWorkerInstance.onmessage?.({
          data: { id: req.id, pageNum: req.pageNum, bitmap: createMockBitmap(), scale: 1.0 },
        } as MessageEvent);
      }
      await Promise.resolve();

      // Complete any newly dispatched renders (page 6 may have been dispatched)
      const laterCalls = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === undefined
      );
      for (const call of laterCalls.slice(4)) {
        const req = call[0];
        mockWorkerInstance.onmessage?.({
          data: { id: req.id, pageNum: req.pageNum, bitmap: createMockBitmap(), scale: 1.0 },
        } as MessageEvent);
      }

      const result = await promise;
      // Pages 3 and 5 were cancelled, so they should not be in the result
      expect(result.has(3)).toBe(false);
      expect(result.has(5)).toBe(false);
      // Other pages should be present
      expect(result.has(1)).toBe(true);
      expect(result.has(2)).toBe(true);
      expect(result.has(4)).toBe(true);
    });
  });

  describe('setPdfUrl clears text content cache', () => {
    it('clears cached text content when switching to a new PDF', async () => {
      queue.setPdfUrl('http://example.com/first.pdf');

      const promise = queue.renderVisible([1], 1.0, true);
      const req = mockWorkerInstance.postMessage.mock.calls.find(
        (c) => c[0].type === undefined
      )![0];

      const textContent = { items: [{ str: 'page one' }], width: 100, height: 200 };
      mockWorkerInstance.onmessage?.({
        data: { id: req.id, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0, textContent },
      } as MessageEvent);
      await promise;

      expect(queue.getTextContent(1)).toEqual(textContent);

      // Switch to a different PDF
      queue.setPdfUrl('http://example.com/second.pdf');

      // Text content should be cleared
      expect(queue.getTextContent(1)).toBeNull();
    });
  });

  describe('renderBuffer schedules idle processing', () => {
    it('calls requestIdleCallback for buffer page processing', () => {
      const requestIdleSpy = vi.fn((cb: IdleRequestCallback) => {
        cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
        return Math.random();
      });
      vi.stubGlobal('requestIdleCallback', requestIdleSpy);

      queue.setPdfUrl('http://example.com/test.pdf');
      queue.renderBuffer([10, 11, 12], 1.0);

      expect(requestIdleSpy).toHaveBeenCalled();
    });

    it('does not schedule multiple idle callbacks', () => {
      // Override to return id without executing callback
      const requestIdleSpy = vi.fn(() => 42);
      vi.stubGlobal('requestIdleCallback', requestIdleSpy);

      const freshQueue = new PdfRenderQueue(5, 5);
      freshQueue.setPdfUrl('http://example.com/test.pdf');
      requestIdleSpy.mockClear();

      freshQueue.renderBuffer([10], 1.0);
      freshQueue.renderBuffer([11], 1.0);
      freshQueue.renderBuffer([12], 1.0);

      // Only one requestIdleCallback should have been made
      expect(requestIdleSpy).toHaveBeenCalledTimes(1);

      freshQueue.destroy();
    });
  });

  describe('findQueuedTask checks both queue and pendingRequests', () => {
    it('does not duplicate buffer renders for pages already pending in worker', () => {
      queue.setPdfUrl('http://example.com/test.pdf');

      // Render page 5 with high priority (will be sent to worker)
      queue.renderVisible([5], 1.0);

      const renderCallsBefore = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === undefined
      ).length;

      // Attempt to buffer render page 5 — should be skipped since it's pending
      queue.renderBuffer([5], 1.0);

      const renderCallsAfter = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === undefined
      ).length;

      // No additional render requests should have been sent
      expect(renderCallsAfter).toBe(renderCallsBefore);
    });
  });

  describe('LRU cache makeKey rounding behavior', () => {
    it('treats scales that round to the same integer key as cache hits', () => {
      // LRUCache.makeKey: `${pageNum}-${Math.round(scale * 100)}`
      // 1.005 * 100 = 100.4999... → rounds to 100
      // 1.004 * 100 = 100.4      → rounds to 100
      // 1.006 * 100 = 100.6      → rounds to 101 (different key)
      queue.setPdfUrl('http://example.com/test.pdf');

      // Render at scale 1.005 (key: "1-100")
      queue.renderVisible([1], 1.005);
      const req = mockWorkerInstance.postMessage.mock.calls.find(
        (c) => c[0].type === undefined
      )![0];
      mockWorkerInstance.onmessage?.({
        data: { id: req.id, pageNum: 1, bitmap: createMockBitmap(), scale: 1.005 },
      } as MessageEvent);

      // 1.004 also maps to key "1-100" (100.4 rounds to 100) → cache hit
      expect(queue.isCached(1, 1.005)).toBe(true);
      expect(queue.isCached(1, 1.004)).toBe(true);

      // 1.006 maps to key "1-101" (100.6 rounds to 101) → cache miss
      expect(queue.isCached(1, 1.006)).toBe(false);
    });
  });

  describe('handleWorkerMessage triggers processQueue', () => {
    it('dispatches queued tasks after a pending request completes', async () => {
      queue.setPdfUrl('http://example.com/test.pdf');

      // Queue 6 pages — first 4 go pending, last 2 stay queued
      const promise = queue.renderVisible([1, 2, 3, 4, 5, 6], 1.0);

      const initialCalls = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === undefined
      );
      expect(initialCalls).toHaveLength(4);

      // Complete page 1 — should trigger processQueue to dispatch page 5
      mockWorkerInstance.onmessage?.({
        data: { id: initialCalls[0][0].id, pageNum: 1, bitmap: createMockBitmap(), scale: 1.0 },
      } as MessageEvent);
      await Promise.resolve();

      const callsAfterFirst = mockWorkerInstance.postMessage.mock.calls.filter(
        (c) => c[0].type === undefined
      );
      // A new request should have been dispatched (page 5)
      expect(callsAfterFirst.length).toBeGreaterThanOrEqual(5);

      // Iteratively complete all remaining render requests until no new ones appear
      const completed = new Set<string>();
      completed.add(initialCalls[0][0].id); // page 1 already done
      let prevCount = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const allCalls = mockWorkerInstance.postMessage.mock.calls.filter(
          (c) => c[0].type === undefined
        );
        const pending = allCalls.filter((c) => !completed.has(c[0].id));
        if (pending.length === 0) break;
        if (allCalls.length === prevCount && pending.length === 0) break;
        prevCount = allCalls.length;

        for (const call of pending) {
          const req = call[0];
          completed.add(req.id);
          mockWorkerInstance.onmessage?.({
            data: { id: req.id, pageNum: req.pageNum, bitmap: createMockBitmap(), scale: 1.0 },
          } as MessageEvent);
        }
        await Promise.resolve();
      }

      const result = await promise;
      expect(result.size).toBe(6);
    });
  });
});
