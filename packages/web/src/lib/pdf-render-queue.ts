/**
 * PDF Render Queue Manager
 *
 * Priority-based render queue with LRU caching for efficient PDF rendering.
 * Prioritizes visible pages, uses idle callbacks for buffer pages,
 * and provides debouncing for zoom changes.
 */

import type {
  RenderRequest,
  RenderResponse,
  CancelRequest,
  TextContentPayload,
} from '../workers/pdf-render.worker';

type RenderPriority = 'high' | 'low';

export type TextContentData = TextContentPayload;
type TextContentCallback = (pageNum: number, textContent: TextContentData) => void;

interface RenderTask {
  id: string;
  pageNum: number;
  scale: number;
  priority: RenderPriority;
  includeText: boolean;
  resolve: (bitmap: ImageBitmap) => void;
  reject: (error: Error) => void;
}

interface LRUEntry {
  bitmap: ImageBitmap;
  lastUsed: number;
}

/**
 * Simple LRU cache for rendered page bitmaps
 */
class LRUCache {
  private cache = new Map<string, LRUEntry>();
  private maxSize: number;

  constructor(maxSize: number = 10) {
    this.maxSize = maxSize;
  }

  /**
   * Generate cache key from page number and scale
   */
  static makeKey(pageNum: number, scale: number): string {
    return `${pageNum}-${Math.round(scale * 100)}`;
  }

  get(key: string): ImageBitmap | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Update last used time
    entry.lastUsed = Date.now();
    return entry.bitmap;
  }

  set(key: string, bitmap: ImageBitmap): void {
    // Evict LRU entries if at capacity
    while (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      bitmap,
      lastUsed: Date.now(),
    });
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey);
      if (entry) {
        entry.bitmap.close(); // Release ImageBitmap resources
      }
      this.cache.delete(oldestKey);
    }
  }

  clear(): void {
    for (const entry of this.cache.values()) {
      entry.bitmap.close();
    }
    this.cache.clear();
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }
}

/**
 * PDF Render Queue with priority scheduling and caching
 */
const MAX_CONCURRENT_RENDERS = 4; // Limit concurrent worker requests
const MAX_TEXT_CACHE_SIZE = 100; // Maximum number of pages to cache text content for

/**
 * Simple LRU cache for text content data
 */
class TextContentLRUCache {
  private cache = new Map<number, { data: TextContentData; lastUsed: number }>();
  private maxSize: number;

  constructor(maxSize: number = MAX_TEXT_CACHE_SIZE) {
    this.maxSize = maxSize;
  }

  get(pageNum: number): TextContentData | null {
    const entry = this.cache.get(pageNum);
    if (!entry) return null;
    entry.lastUsed = Date.now();
    return entry.data;
  }

  set(pageNum: number, data: TextContentData): void {
    // Evict LRU entries if at capacity
    while (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    this.cache.set(pageNum, { data, lastUsed: Date.now() });
  }

  has(pageNum: number): boolean {
    return this.cache.has(pageNum);
  }

  clear(): void {
    this.cache.clear();
  }

  private evictLRU(): void {
    let oldestKey: number | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.cache.delete(oldestKey);
    }
  }
}

export class PdfRenderQueue {
  private worker: Worker;
  private queue = new Map<string, RenderTask>();
  private pendingRequests = new Map<string, RenderTask>();
  private cache: LRUCache;
  private textContentCache: TextContentLRUCache;
  private textContentCallbacks: TextContentCallback[] = [];
  private idCounter = 0;
  private currentPdfUrl: string | null = null;
  private devicePixelRatio: number;
  private idleCallbackId: number | null = null;
  private processing = false;

  constructor(maxCacheSize: number = 15, maxTextCacheSize: number = MAX_TEXT_CACHE_SIZE) {
    // Create the worker
    this.worker = new Worker(
      new URL('../workers/pdf-render.worker.ts', import.meta.url),
      { type: 'module' }
    );

    this.worker.onmessage = this.handleWorkerMessage.bind(this);
    this.worker.onerror = this.handleWorkerError.bind(this);

    this.cache = new LRUCache(maxCacheSize);
    this.textContentCache = new TextContentLRUCache(maxTextCacheSize);
    this.devicePixelRatio = window.devicePixelRatio || 1;
  }

  /**
   * Set the current PDF URL for rendering
   */
  setPdfUrl(url: string): void {
    if (this.currentPdfUrl !== url) {
      this.currentPdfUrl = url;
      this.textContentCache.clear();
      // Cancel all pending renders when PDF changes
      this.cancelAll();
    }
  }

  /**
   * Render visible pages with high priority (immediate)
   */
  async renderVisible(
    pages: number[],
    scale: number,
    includeText: boolean = true
  ): Promise<Map<number, ImageBitmap>> {
    const results = new Map<number, ImageBitmap>();
    const promises: Promise<void>[] = [];

    for (const pageNum of pages) {
      const cacheKey = LRUCache.makeKey(pageNum, scale);
      const cached = this.cache.get(cacheKey);

      if (cached) {
        results.set(pageNum, cached);
        continue;
      }

      promises.push(
        this.queueRender(pageNum, scale, 'high', includeText).then((bitmap) => {
          results.set(pageNum, bitmap);
        }).catch(() => {
          // Ignore errors for individual pages
        })
      );
    }

    await Promise.all(promises);
    return results;
  }

  /**
   * Render buffer pages with low priority (idle callback)
   */
  renderBuffer(pages: number[], scale: number): void {
    for (const pageNum of pages) {
      const cacheKey = LRUCache.makeKey(pageNum, scale);

      // Skip if already cached or queued
      if (this.cache.has(cacheKey)) continue;

      const existingId = this.findQueuedTask(pageNum, scale);
      if (existingId) continue;

      // Queue with low priority
      this.queueRender(pageNum, scale, 'low', false).catch(() => {
        // Ignore errors for buffer pages
      });
    }

    // Schedule processing during idle time
    this.scheduleIdleProcessing();
  }

  /**
   * Cancel renders for specific pages
   */
  cancel(pages: number[]): void {
    const pageSet = new Set(pages);

    // Cancel queued tasks
    for (const [id, task] of this.queue) {
      if (pageSet.has(task.pageNum)) {
        task.reject(new Error('Cancelled'));
        this.queue.delete(id);
      }
    }

    // Cancel pending requests
    for (const [id, task] of this.pendingRequests) {
      if (pageSet.has(task.pageNum)) {
        const cancelMsg: CancelRequest = { type: 'cancel', id };
        this.worker.postMessage(cancelMsg);
        task.reject(new Error('Cancelled'));
        this.pendingRequests.delete(id);
      }
    }
  }

  /**
   * Cancel all pending renders
   */
  cancelAll(): void {
    // Cancel all queued tasks
    for (const [_, task] of this.queue) {
      task.reject(new Error('Cancelled'));
    }
    this.queue.clear();

    // Cancel all pending requests
    for (const [id, task] of this.pendingRequests) {
      const cancelMsg: CancelRequest = { type: 'cancel', id };
      this.worker.postMessage(cancelMsg);
      task.reject(new Error('Cancelled'));
    }
    this.pendingRequests.clear();

    // Cancel idle callback
    if (this.idleCallbackId !== null) {
      cancelIdleCallback(this.idleCallbackId);
      this.idleCallbackId = null;
    }
  }

  /**
   * Get a cached bitmap if available
   */
  getCached(pageNum: number, scale: number): ImageBitmap | null {
    const cacheKey = LRUCache.makeKey(pageNum, scale);
    return this.cache.get(cacheKey);
  }

  /**
   * Check if a page is cached at the given scale
   */
  isCached(pageNum: number, scale: number): boolean {
    const cacheKey = LRUCache.makeKey(pageNum, scale);
    return this.cache.has(cacheKey);
  }

  /**
   * Get cached text content for a page
   */
  getTextContent(pageNum: number): TextContentData | null {
    return this.textContentCache.get(pageNum) || null;
  }

  /**
   * Register a callback for when text content is received
   */
  onTextContent(callback: TextContentCallback): () => void {
    this.textContentCallbacks.push(callback);
    return () => {
      const idx = this.textContentCallbacks.indexOf(callback);
      if (idx >= 0) this.textContentCallbacks.splice(idx, 1);
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.cancelAll();
    this.cache.clear();
    this.textContentCache.clear();
    this.worker.terminate();
  }

  /**
   * Queue a render task
   */
  private queueRender(
    pageNum: number,
    scale: number,
    priority: RenderPriority,
    includeText: boolean
  ): Promise<ImageBitmap> {
    return new Promise((resolve, reject) => {
      const id = this.generateId();

      const task: RenderTask = {
        id,
        pageNum,
        scale,
        priority,
        includeText,
        resolve,
        reject,
      };

      this.queue.set(id, task);
      this.processQueue();
    });
  }

  /**
   * Process queued render tasks with concurrency limit
   */
  private processQueue(): void {
    if (this.processing || !this.currentPdfUrl) return;
    this.processing = true;

    // Check how many slots are available
    const availableSlots = MAX_CONCURRENT_RENDERS - this.pendingRequests.size;
    if (availableSlots <= 0) {
      this.processing = false;
      return;
    }

    // Process high priority tasks first, then low priority
    const allTasks = Array.from(this.queue.values());
    const highPriorityTasks = allTasks.filter((t) => t.priority === 'high');
    const lowPriorityTasks = allTasks.filter((t) => t.priority === 'low');

    const tasksToProcess = [...highPriorityTasks, ...lowPriorityTasks].slice(0, availableSlots);

    for (const task of tasksToProcess) {
      this.sendRenderRequest(task);
    }

    this.processing = false;
  }

  /**
   * Send a render request to the worker
   */
  private sendRenderRequest(task: RenderTask): void {
    if (!this.currentPdfUrl) {
      task.reject(new Error('No PDF URL set'));
      this.queue.delete(task.id);
      return;
    }

    const request: RenderRequest = {
      id: task.id,
      pdfUrl: this.currentPdfUrl,
      pageNum: task.pageNum,
      scale: task.scale,
      devicePixelRatio: this.devicePixelRatio,
      includeText: task.includeText,
    };

    // Move from queue to pending
    this.queue.delete(task.id);
    this.pendingRequests.set(task.id, task);

    this.worker.postMessage(request);
  }

  /**
   * Handle messages from the worker
   */
  private handleWorkerMessage(event: MessageEvent<RenderResponse>): void {
    const response = event.data;
    const task = this.pendingRequests.get(response.id);

    if (!task) return;

    this.pendingRequests.delete(response.id);

    if ('error' in response) {
      task.reject(new Error(response.error));
    } else {
      // Cache the bitmap result
      const cacheKey = LRUCache.makeKey(task.pageNum, task.scale);
      this.cache.set(cacheKey, response.bitmap);

      // Cache and notify about text content (only once per page)
      if (response.textContent && !this.textContentCache.has(task.pageNum)) {
        this.textContentCache.set(task.pageNum, response.textContent);
        // Notify all callbacks
        for (const callback of this.textContentCallbacks) {
          try {
            callback(task.pageNum, response.textContent);
          } catch (e) {
            console.error('Text content callback error:', e);
          }
        }
      }

      task.resolve(response.bitmap);
    }

    // Process more tasks
    this.processQueue();
  }

  /**
   * Handle worker errors
   */
  private handleWorkerError(error: ErrorEvent): void {
    console.error('PDF render worker error:', error);

    // Reject all pending requests
    for (const [_, task] of this.pendingRequests) {
      task.reject(new Error('Worker error'));
    }
    this.pendingRequests.clear();
  }

  /**
   * Schedule processing of low priority tasks during idle time
   */
  private scheduleIdleProcessing(): void {
    if (this.idleCallbackId !== null) return;

    this.idleCallbackId = requestIdleCallback(
      (deadline) => {
        this.idleCallbackId = null;
        this.processIdleTasks(deadline);
      },
      { timeout: 2000 }
    );
  }

  /**
   * Process low priority tasks during idle time
   */
  private processIdleTasks(deadline: IdleDeadline): void {
    const lowPriorityTasks = Array.from(this.queue.values()).filter(
      (t) => t.priority === 'low'
    );

    for (const task of lowPriorityTasks) {
      // Stop if we're out of idle time
      if (deadline.timeRemaining() < 1) {
        this.scheduleIdleProcessing();
        break;
      }

      this.sendRenderRequest(task);
    }
  }

  /**
   * Find a queued task for a specific page and scale
   */
  private findQueuedTask(pageNum: number, scale: number): string | null {
    for (const [id, task] of this.queue) {
      if (task.pageNum === pageNum && task.scale === scale) {
        return id;
      }
    }
    for (const [id, task] of this.pendingRequests) {
      if (task.pageNum === pageNum && task.scale === scale) {
        return id;
      }
    }
    return null;
  }

  /**
   * Generate a unique ID for render requests
   */
  private generateId(): string {
    return `render-${++this.idCounter}-${Date.now()}`;
  }
}

/**
 * Debounce helper for zoom changes
 */
export function createZoomDebouncer(
  callback: (zoom: number) => void,
  delay: number = 150
): (zoom: number) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (zoom: number) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      callback(zoom);
    }, delay);
  };
}
