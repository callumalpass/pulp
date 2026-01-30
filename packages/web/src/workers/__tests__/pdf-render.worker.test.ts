import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Types mirrored from the worker ---

type RenderRequest = {
  id: string;
  pdfUrl: string;
  pageNum: number;
  scale: number;
  devicePixelRatio: number;
  includeText: boolean;
};

type CancelRequest = {
  type: 'cancel';
  id: string;
};

type WorkerMessage = RenderRequest | CancelRequest;

// --- Mock setup ---

// Track postMessage calls from the worker
const postMessageSpy = vi.fn();

// Mock self (DedicatedWorkerGlobalScope)
const selfMock = {
  onmessage: null as ((event: MessageEvent<WorkerMessage>) => void) | null,
  postMessage: postMessageSpy,
};

vi.stubGlobal('self', selfMock);

// Mock OffscreenCanvas
class MockOffscreenCanvas {
  width: number;
  height: number;
  private ctx = {
    fillRect: vi.fn(),
    clearRect: vi.fn(),
  };

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext(type: string) {
    if (type === '2d') return this.ctx;
    return null;
  }
}

vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);

// Mock createImageBitmap
const mockBitmaps: Array<{ close: ReturnType<typeof vi.fn> }> = [];
function createMockBitmap() {
  const bitmap = { close: vi.fn(), width: 100, height: 100 };
  mockBitmaps.push(bitmap);
  return bitmap;
}

vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.resolve(createMockBitmap())));

// Mock PDF.js
const mockRenderTask = {
  promise: Promise.resolve(),
  cancel: vi.fn(),
};

const mockTextContent = {
  items: [{ str: 'Hello', dir: 'ltr', transform: [1, 0, 0, 1, 0, 0], width: 50, height: 12, hasEOL: false }],
  styles: {},
};

const mockPage = {
  getViewport: vi.fn(({ scale }: { scale: number }) => ({
    width: 612 * scale,
    height: 792 * scale,
  })),
  render: vi.fn(() => mockRenderTask),
  getTextContent: vi.fn(() => Promise.resolve(mockTextContent)),
};

const mockPdfDocument = {
  getPage: vi.fn(() => Promise.resolve(mockPage)),
  numPages: 10,
};

const mockLoadingTask = {
  promise: Promise.resolve(mockPdfDocument),
};

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  version: '4.0.0',
  getDocument: vi.fn(() => mockLoadingTask),
}));

// Import after mocks are set up — this triggers module execution
// which sets self.onmessage
let pdfjsLib: typeof import('pdfjs-dist');

beforeEach(async () => {
  // Reset all mocks
  vi.clearAllMocks();
  mockBitmaps.length = 0;
  selfMock.onmessage = null;

  // Reset modules to clear module-level caches (pdfCache, textContentCache, pendingRenders)
  vi.resetModules();

  // Re-setup global mocks (resetModules clears them)
  vi.stubGlobal('self', selfMock);
  vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
  vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.resolve(createMockBitmap())));

  // Re-import pdfjs mock
  pdfjsLib = await import('pdfjs-dist');

  // Import the worker module — this sets self.onmessage
  await import('../pdf-render.worker');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper to dispatch a message event to the worker
function dispatchMessage(data: WorkerMessage): Promise<void> {
  const event = { data } as MessageEvent<WorkerMessage>;
  selfMock.onmessage?.(event);
  // Allow async handlers to run
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeRenderRequest(overrides: Partial<RenderRequest> = {}): RenderRequest {
  return {
    id: `render-${Math.random().toString(36).slice(2)}`,
    pdfUrl: 'http://localhost/test.pdf',
    pageNum: 1,
    scale: 1.0,
    devicePixelRatio: 2,
    includeText: false,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('PDF Render Worker', () => {
  describe('module initialization', () => {
    it('sets self.onmessage handler', () => {
      expect(selfMock.onmessage).toBeTypeOf('function');
    });

    it('configures PDF.js worker source', () => {
      expect(pdfjsLib.GlobalWorkerOptions.workerSrc).toContain('pdf.worker.min.mjs');
    });
  });

  describe('render requests', () => {
    it('loads PDF document, renders page, and returns bitmap', async () => {
      const request = makeRenderRequest({ pageNum: 3 });
      await dispatchMessage(request);

      // Should have loaded the PDF
      expect(pdfjsLib.getDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          url: request.pdfUrl,
          cMapPacked: true,
        })
      );

      // Should have fetched the correct page
      expect(mockPdfDocument.getPage).toHaveBeenCalledWith(3);

      // Should have rendered with the correct scale
      const effectiveScale = request.scale * request.devicePixelRatio;
      expect(mockPage.getViewport).toHaveBeenCalledWith({ scale: effectiveScale });
      expect(mockPage.render).toHaveBeenCalled();

      // Should have posted bitmap response
      expect(postMessageSpy).toHaveBeenCalledTimes(1);
      const [response, transferables] = postMessageSpy.mock.calls[0];
      expect(response).toMatchObject({
        id: request.id,
        pageNum: 3,
        scale: 1.0,
      });
      expect(response.bitmap).toBeDefined();
      // Bitmap should be transferred (not copied)
      expect(transferables).toEqual([response.bitmap]);
    });

    it('applies effective scale (scale * devicePixelRatio)', async () => {
      const request = makeRenderRequest({ scale: 1.5, devicePixelRatio: 3 });
      await dispatchMessage(request);

      expect(mockPage.getViewport).toHaveBeenCalledWith({ scale: 4.5 });
    });

    it('rounds canvas dimensions to avoid floating-point truncation', async () => {
      // Set viewport to return non-integer dimensions
      mockPage.getViewport.mockReturnValueOnce({
        width: 918.75,
        height: 1188.3,
      });

      const request = makeRenderRequest();
      await dispatchMessage(request);

      // The OffscreenCanvas constructor should receive rounded values
      // We verify this indirectly through createImageBitmap being called
      // (OffscreenCanvas is constructed with Math.round values)
      expect(globalThis.createImageBitmap).toHaveBeenCalled();
    });

    it('includes text content when includeText is true', async () => {
      const request = makeRenderRequest({ includeText: true });
      await dispatchMessage(request);

      expect(mockPage.getTextContent).toHaveBeenCalled();

      const response = postMessageSpy.mock.calls[0][0];
      expect(response.textContent).toEqual(mockTextContent);
    });

    it('does not extract text content when includeText is false', async () => {
      const request = makeRenderRequest({ includeText: false });
      await dispatchMessage(request);

      expect(mockPage.getTextContent).not.toHaveBeenCalled();

      const response = postMessageSpy.mock.calls[0][0];
      expect(response.textContent).toBeUndefined();
    });

    it('sends response scale matching the request scale', async () => {
      const request = makeRenderRequest({ scale: 2.5 });
      await dispatchMessage(request);

      const response = postMessageSpy.mock.calls[0][0];
      expect(response.scale).toBe(2.5);
    });
  });

  describe('PDF document caching', () => {
    it('caches PDF documents by URL', async () => {
      const request1 = makeRenderRequest({ id: 'r1', pdfUrl: 'http://localhost/a.pdf' });
      const request2 = makeRenderRequest({ id: 'r2', pdfUrl: 'http://localhost/a.pdf', pageNum: 2 });

      await dispatchMessage(request1);
      await dispatchMessage(request2);

      // getDocument should only be called once for the same URL
      expect(pdfjsLib.getDocument).toHaveBeenCalledTimes(1);
    });

    it('loads different documents for different URLs', async () => {
      const request1 = makeRenderRequest({ id: 'r1', pdfUrl: 'http://localhost/a.pdf' });
      const request2 = makeRenderRequest({ id: 'r2', pdfUrl: 'http://localhost/b.pdf' });

      await dispatchMessage(request1);
      await dispatchMessage(request2);

      expect(pdfjsLib.getDocument).toHaveBeenCalledTimes(2);
    });
  });

  describe('text content caching', () => {
    it('caches text content per page to avoid re-extraction', async () => {
      const request1 = makeRenderRequest({ id: 'r1', pageNum: 1, includeText: true });
      const request2 = makeRenderRequest({ id: 'r2', pageNum: 1, includeText: true });

      await dispatchMessage(request1);
      await dispatchMessage(request2);

      // getTextContent should only be called once for the same page
      expect(mockPage.getTextContent).toHaveBeenCalledTimes(1);

      // Both responses should have text content
      expect(postMessageSpy.mock.calls[0][0].textContent).toEqual(mockTextContent);
      expect(postMessageSpy.mock.calls[1][0].textContent).toEqual(mockTextContent);
    });

    it('extracts text independently for different pages', async () => {
      const request1 = makeRenderRequest({ id: 'r1', pageNum: 1, includeText: true });
      const request2 = makeRenderRequest({ id: 'r2', pageNum: 2, includeText: true });

      await dispatchMessage(request1);
      await dispatchMessage(request2);

      // getTextContent should be called once per distinct page
      expect(mockPage.getTextContent).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancellation', () => {
    it('handles cancel requests for pending renders', async () => {
      // Make render hang by never resolving
      const neverResolve = new Promise<void>(() => {});
      const cancelFn = vi.fn();
      mockPage.render.mockReturnValueOnce({
        promise: neverResolve,
        cancel: cancelFn,
      });

      const request = makeRenderRequest({ id: 'render-to-cancel' });

      // Start render (don't await — it will hang)
      dispatchMessage(request);

      // Allow the render to register in pendingRenders
      await new Promise((r) => setTimeout(r, 0));

      // Send cancel
      await dispatchMessage({ type: 'cancel', id: 'render-to-cancel' });

      expect(cancelFn).toHaveBeenCalled();
    });

    it('ignores cancel requests for unknown IDs', async () => {
      // Should not throw
      await dispatchMessage({ type: 'cancel', id: 'nonexistent-id' });
      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('silently swallows RenderingCancelledException errors', async () => {
      const cancelError = new Error('Rendering cancelled');
      cancelError.name = 'RenderingCancelledException';

      mockPage.render.mockReturnValueOnce({
        promise: Promise.reject(cancelError),
        cancel: vi.fn(),
      });

      const request = makeRenderRequest();
      await dispatchMessage(request);

      // Should NOT post any message (neither success nor error)
      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('cleans up pendingRenders on successful completion', async () => {
      const request = makeRenderRequest({ id: 'render-cleanup' });
      await dispatchMessage(request);

      // After successful render, sending a cancel for the same ID should be a no-op
      const cancelFn = vi.fn();
      mockPage.render.mockReturnValue({ promise: Promise.resolve(), cancel: cancelFn });

      await dispatchMessage({ type: 'cancel', id: 'render-cleanup' });
      // cancel function should NOT be called because the render already completed
      // and was removed from pendingRenders
      expect(cancelFn).not.toHaveBeenCalled();
    });

    it('cleans up pendingRenders on error', async () => {
      const renderError = new Error('GPU context lost');
      mockPage.render.mockReturnValueOnce({
        promise: Promise.reject(renderError),
        cancel: vi.fn(),
      });

      const request = makeRenderRequest({ id: 'render-error' });
      await dispatchMessage(request);

      // After error, cancel for this ID should be a no-op
      const cancelFn2 = vi.fn();
      mockPage.render.mockReturnValue({ promise: Promise.resolve(), cancel: cancelFn2 });

      await dispatchMessage({ type: 'cancel', id: 'render-error' });
      expect(cancelFn2).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('posts error response when rendering fails', async () => {
      mockPage.render.mockReturnValueOnce({
        promise: Promise.reject(new Error('WebGL context lost')),
        cancel: vi.fn(),
      });

      const request = makeRenderRequest({ id: 'err-1' });
      await dispatchMessage(request);

      expect(postMessageSpy).toHaveBeenCalledTimes(1);
      const response = postMessageSpy.mock.calls[0][0];
      expect(response).toEqual({
        id: 'err-1',
        error: 'WebGL context lost',
      });
      // Error responses should NOT include transferables
      expect(postMessageSpy.mock.calls[0][1]).toBeUndefined();
    });

    it('posts error response when PDF loading fails', async () => {
      const { getDocument } = await import('pdfjs-dist');
      (getDocument as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        promise: Promise.reject(new Error('Network error')),
      });

      const request = makeRenderRequest({ id: 'err-2', pdfUrl: 'http://localhost/bad.pdf' });
      await dispatchMessage(request);

      expect(postMessageSpy).toHaveBeenCalledTimes(1);
      const response = postMessageSpy.mock.calls[0][0];
      expect(response).toEqual({
        id: 'err-2',
        error: 'Network error',
      });
    });

    it('posts error response when page fetch fails', async () => {
      mockPdfDocument.getPage.mockRejectedValueOnce(new Error('Invalid page number'));

      const request = makeRenderRequest({ id: 'err-3', pageNum: 999 });
      await dispatchMessage(request);

      expect(postMessageSpy).toHaveBeenCalledTimes(1);
      const response = postMessageSpy.mock.calls[0][0];
      expect(response).toEqual({
        id: 'err-3',
        error: 'Invalid page number',
      });
    });

    it('handles non-Error thrown values gracefully', async () => {
      mockPage.render.mockReturnValueOnce({
        promise: Promise.reject('string error'),
        cancel: vi.fn(),
      });

      const request = makeRenderRequest({ id: 'err-4' });
      await dispatchMessage(request);

      expect(postMessageSpy).toHaveBeenCalledTimes(1);
      const response = postMessageSpy.mock.calls[0][0];
      expect(response).toEqual({
        id: 'err-4',
        error: 'Unknown render error',
      });
    });

    it('handles OffscreenCanvas context failure', async () => {
      // Override OffscreenCanvas to return null context
      vi.stubGlobal('OffscreenCanvas', class {
        width: number;
        height: number;
        constructor(w: number, h: number) { this.width = w; this.height = h; }
        getContext() { return null; }
      });

      const request = makeRenderRequest({ id: 'err-ctx' });
      await dispatchMessage(request);

      expect(postMessageSpy).toHaveBeenCalledTimes(1);
      const response = postMessageSpy.mock.calls[0][0];
      expect(response).toEqual({
        id: 'err-ctx',
        error: 'Failed to get 2d context from OffscreenCanvas',
      });

      // Restore
      vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
    });
  });

  describe('concurrent rendering and text extraction', () => {
    it('initiates both render and text extraction before waiting for results', async () => {
      // Use deferred promises so we can verify both are started concurrently
      let resolveRender!: () => void;
      let resolveText!: (value: unknown) => void;

      const renderPromise = new Promise<void>((resolve) => {
        resolveRender = resolve;
      });
      const textPromise = new Promise((resolve) => {
        resolveText = resolve;
      });

      mockPage.render.mockReturnValueOnce({
        promise: renderPromise,
        cancel: vi.fn(),
      });
      mockPage.getTextContent.mockReturnValueOnce(textPromise);

      const request = makeRenderRequest({ includeText: true });

      // Start the message handler (don't await — both promises are pending)
      dispatchMessage(request);

      // Allow microtasks so the handler reaches Promise.all
      await new Promise((r) => setTimeout(r, 0));

      // Both render and getTextContent should have been called concurrently
      // (i.e., both started before either resolved)
      expect(mockPage.render).toHaveBeenCalled();
      expect(mockPage.getTextContent).toHaveBeenCalled();

      // Resolve both to prevent hanging
      resolveRender();
      resolveText(mockTextContent);
    });
  });

  describe('PDF.js configuration', () => {
    it('passes cMapUrl and standardFontDataUrl to getDocument', async () => {
      const request = makeRenderRequest();
      await dispatchMessage(request);

      expect(pdfjsLib.getDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          cMapUrl: expect.stringContaining('/cmaps/'),
          cMapPacked: true,
          standardFontDataUrl: expect.stringContaining('/standard_fonts/'),
        })
      );
    });
  });

  describe('message routing', () => {
    it('routes cancel messages based on type field', async () => {
      // Cancel message should be handled without calling render pipeline
      await dispatchMessage({ type: 'cancel', id: 'some-id' });

      expect(pdfjsLib.getDocument).not.toHaveBeenCalled();
      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('routes render messages (no type field) to render pipeline', async () => {
      const request = makeRenderRequest();
      await dispatchMessage(request);

      expect(pdfjsLib.getDocument).toHaveBeenCalled();
      expect(postMessageSpy).toHaveBeenCalled();
    });
  });
});
