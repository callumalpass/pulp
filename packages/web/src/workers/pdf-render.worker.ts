/**
 * PDF Render Worker
 *
 * Handles PDF page rendering off the main thread using OffscreenCanvas.
 * Receives render requests, renders pages, and returns ImageBitmaps.
 */

/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

// Configure PDF.js worker (same as main thread)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// Types for worker communication
export type RenderRequest = {
  id: string;
  pdfUrl: string;
  pageNum: number;
  scale: number;
  devicePixelRatio: number;
};

export type RenderResponse =
  | {
      id: string;
      pageNum: number;
      bitmap: ImageBitmap;
      scale: number;
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

// Track pending render tasks for cancellation
const pendingRenders = new Map<string, { cancel: () => void }>();

/**
 * Load or retrieve a cached PDF document
 */
async function getPdfDocument(url: string): Promise<PDFDocumentProxy> {
  const cached = pdfCache.get(url);
  if (cached) {
    return cached;
  }

  const loadingTask = pdfjsLib.getDocument(url);
  const pdf = await loadingTask.promise;
  pdfCache.set(url, pdf);
  return pdf;
}

/**
 * Render a PDF page to an OffscreenCanvas and return the ImageBitmap
 */
async function renderPage(request: RenderRequest): Promise<ImageBitmap> {
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

  try {
    await renderTask.promise;
    pendingRenders.delete(request.id);

    // Create ImageBitmap from the rendered canvas
    const bitmap = await createImageBitmap(canvas);
    return bitmap;
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
    const bitmap = await renderPage(request);

    const response: RenderResponse = {
      id: request.id,
      pageNum: request.pageNum,
      bitmap,
      scale: request.scale,
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
