/**
 * PDF Render Worker
 *
 * Handles PDF page rendering off the main thread using OffscreenCanvas.
 * Receives render requests, renders pages, and returns ImageBitmaps.
 * Optionally extracts text content for the text layer.
 */

/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

// Configure PDF.js worker (same as main thread)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// PDF.js resource URLs for accurate text rendering
const PDFJS_CDN_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}`;
const CMAP_URL = `${PDFJS_CDN_BASE}/cmaps/`;
const STANDARD_FONT_URL = `${PDFJS_CDN_BASE}/standard_fonts/`;

// Types for worker communication
export type RenderRequest = {
  id: string;
  pdfUrl: string;
  pageNum: number;
  scale: number;
  devicePixelRatio: number;
  includeText: boolean;
};

export type TextContentPayload = Awaited<ReturnType<PDFPageProxy['getTextContent']>>;

export type RenderResponse =
  | {
      id: string;
      pageNum: number;
      bitmap: ImageBitmap;
      scale: number;
      textContent?: TextContentPayload;
    }
  | {
      id: string;
      error: string;
    };

export type CancelRequest = {
  type: 'cancel';
  id: string;
};

export type WorkerMessage = RenderRequest | CancelRequest;

// Cache loaded PDF documents by URL
const pdfCache = new Map<string, PDFDocumentProxy>();

// Cache text content per page to avoid re-extraction
const textContentCache = new Map<string, TextContentPayload>();

// Track pending render tasks for cancellation
const pendingRenders = new Map<string, { cancel: () => void }>();

function getTextCacheKey(url: string, pageNum: number): string {
  return `${url}:${pageNum}`;
}

/**
 * Load or retrieve a cached PDF document
 */
async function getPdfDocument(url: string): Promise<PDFDocumentProxy> {
  const cached = pdfCache.get(url);
  if (cached) {
    return cached;
  }

  const loadingTask = pdfjsLib.getDocument({
    url,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_URL,
  });
  const pdf = await loadingTask.promise;
  pdfCache.set(url, pdf);
  return pdf;
}

/**
 * Render a PDF page to an OffscreenCanvas and return the ImageBitmap + text content
 */
async function renderPage(request: RenderRequest): Promise<{ bitmap: ImageBitmap; textContent?: TextContentPayload }> {
  const { pdfUrl, pageNum, scale, devicePixelRatio } = request;

  const pdf = await getPdfDocument(pdfUrl);
  const page: PDFPageProxy = await pdf.getPage(pageNum);

  const effectiveScale = scale * devicePixelRatio;
  const viewport = page.getViewport({ scale: effectiveScale });

  // Create OffscreenCanvas for rendering
  const canvas = new OffscreenCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get 2d context from OffscreenCanvas');
  }

  const renderTask = page.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
  });

  // Store cancel function for this render
  pendingRenders.set(request.id, {
    cancel: () => renderTask.cancel(),
  });

  let textContentPromise: Promise<TextContentPayload | null> = Promise.resolve(null);
  if (request.includeText) {
    const cacheKey = getTextCacheKey(pdfUrl, pageNum);
    const cachedText = textContentCache.get(cacheKey);
    if (cachedText) {
      textContentPromise = Promise.resolve(cachedText);
    } else {
      textContentPromise = page.getTextContent().then((content) => {
        textContentCache.set(cacheKey, content);
        return content;
      });
    }
  }

  try {
    const [, textContent] = await Promise.all([
      renderTask.promise,
      textContentPromise,
    ]);
    pendingRenders.delete(request.id);

    // Create ImageBitmap from the rendered canvas
    const bitmap = await createImageBitmap(canvas);
    return textContent ? { bitmap, textContent } : { bitmap };
  } catch (error) {
    pendingRenders.delete(request.id);
    throw error;
  }
}

/**
 * Handle incoming messages from main thread
 */
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  // Handle cancellation requests
  if ('type' in message && message.type === 'cancel') {
    const pending = pendingRenders.get(message.id);
    if (pending) {
      pending.cancel();
      pendingRenders.delete(message.id);
    }
    return;
  }

  // Handle render requests
  const request = message as RenderRequest;

  try {
    const { bitmap, textContent } = await renderPage(request);

    const response: RenderResponse = {
      id: request.id,
      pageNum: request.pageNum,
      bitmap,
      scale: request.scale,
      textContent,
    };

    // Transfer the bitmap (no copy)
    self.postMessage(response, [bitmap]);
  } catch (error) {
    // Don't report cancellation errors
    if ((error as Error).name === 'RenderingCancelledException') {
      return;
    }

    const response: RenderResponse = {
      id: request.id,
      error: error instanceof Error ? error.message : 'Unknown render error',
    };
    self.postMessage(response);
  }
};

// Export types for main thread consumption
export {};
