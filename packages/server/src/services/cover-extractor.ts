import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';
import EPub from 'epub2';
import type { Config } from '../config/schema.js';
import { buildPdfDocumentOptions, toUint8ArrayView } from './pdfjs-options.js';

/** Width of extracted cover images in pixels */
const COVER_WIDTH = 300;

/** Height of extracted cover images in pixels */
const COVER_HEIGHT = 450;

/** WebP compression quality (0-100) */
const COVER_QUALITY = 80;

/** Scale factor for PDF rendering (higher = better quality before downscale) */
const PDF_RENDER_SCALE = 2;

/** Timeout for EPUB cover extraction in milliseconds */
const EPUB_COVER_TIMEOUT_MS = 15000;

/** Maximum PDF size to allow for cover extraction (bytes) */
const MAX_PDF_COVER_SOURCE_BYTES = 200 * 1024 * 1024;

/** Maximum concurrent cover extraction tasks */
const MAX_CONCURRENT_COVER_EXTRACTIONS = 2;

/** Common cover image patterns to search for in EPUB manifests */
const EPUB_COVER_PATTERNS = [
  'cover',
  'cover-image',
  'coverimage',
  'frontcover',
  'front-cover',
  'book-cover',
  'bookcover',
  'jacket',
  'title',
  'titlepage',
];

/** Minimum image dimensions to consider as a potential cover (in pixels) */
const MIN_COVER_DIMENSION = 100;

export class CoverExtractor {
  private cacheDir: string;
  private readonly coverWidth: number;
  private readonly coverHeight: number;
  private readonly coverQuality: number;
  private readonly maxConcurrentExtractions: number;
  private activeExtractions = 0;
  private extractionWaitQueue: Array<() => void> = [];
  private inFlightExtractions: Map<string, Promise<Buffer | null>> = new Map();

  constructor(config: Config) {
    this.cacheDir = join(config.library_path, '.pulp-cache', 'covers');
    // Use config values with fallbacks to default constants
    this.coverWidth = config.cover_width ?? COVER_WIDTH;
    this.coverHeight = config.cover_height ?? COVER_HEIGHT;
    this.coverQuality = config.cover_quality ?? COVER_QUALITY;
    this.maxConcurrentExtractions = MAX_CONCURRENT_COVER_EXTRACTIONS;
    this.ensureCacheDir();
  }

  private ensureCacheDir(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  getCachedCoverPath(noteId: string): string {
    return join(this.cacheDir, `${noteId}.webp`);
  }

  hasCachedCover(noteId: string): boolean {
    return existsSync(this.getCachedCoverPath(noteId));
  }

  async getCover(noteId: string, sourcePath: string, sourceType: 'pdf' | 'epub'): Promise<Buffer | null> {
    // Check cache first
    const cachePath = this.getCachedCoverPath(noteId);
    if (existsSync(cachePath)) {
      return readFileSync(cachePath);
    }

    const inFlight = this.inFlightExtractions.get(noteId);
    if (inFlight) {
      return inFlight;
    }

    const extractionPromise = this.withExtractionSlot(async () => {
      // Check cache again after waiting for a slot in case another request populated it.
      if (existsSync(cachePath)) {
        return readFileSync(cachePath);
      }

      // Extract and cache
      try {
        const cover = sourceType === 'pdf'
          ? await this.extractPDFCover(sourcePath)
          : await this.extractEPUBCover(sourcePath);

        if (cover) {
          writeFileSync(cachePath, cover);
          return cover;
        }
      } catch (error) {
        console.error(`Failed to extract cover for ${noteId}:`, error);
      }

      return null;
    }).finally(() => {
      this.inFlightExtractions.delete(noteId);
    });

    this.inFlightExtractions.set(noteId, extractionPromise);
    return extractionPromise;
  }

  private async withExtractionSlot<T>(work: () => Promise<T>): Promise<T> {
    if (this.activeExtractions >= this.maxConcurrentExtractions) {
      await new Promise<void>((resolve) => {
        this.extractionWaitQueue.push(resolve);
      });
    }

    this.activeExtractions++;

    try {
      return await work();
    } finally {
      this.activeExtractions--;
      const next = this.extractionWaitQueue.shift();
      if (next) {
        next();
      }
    }
  }

  private async extractPDFCover(pdfPath: string): Promise<Buffer | null> {
    let pdf: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']> | null = null;

    try {
      const fileSize = statSync(pdfPath).size;
      if (fileSize > MAX_PDF_COVER_SOURCE_BYTES) {
        console.warn(
          `Skipping PDF cover extraction for oversized file (${fileSize} bytes): ${pdfPath}`
        );
        return null;
      }

      const fileBuffer = readFileSync(pdfPath);
      const data = toUint8ArrayView(fileBuffer);
      pdf = await pdfjsLib.getDocument(buildPdfDocumentOptions(data)).promise;
      const page = await pdf.getPage(1);

      // Calculate scale to fit desired dimensions (render at higher scale for quality)
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(
        (this.coverWidth * PDF_RENDER_SCALE) / viewport.width,
        (this.coverHeight * PDF_RENDER_SCALE) / viewport.height
      );
      const scaledViewport = page.getViewport({ scale });

      // Create canvas and render the page
      const canvas = createCanvas(scaledViewport.width, scaledViewport.height);
      const ctx = canvas.getContext('2d');

      // Render the PDF page to canvas
      await page.render({
        canvasContext: ctx as unknown as CanvasRenderingContext2D,
        viewport: scaledViewport,
      }).promise;

      // Convert canvas to PNG buffer
      const pngBuffer = canvas.toBuffer('image/png');

      // Resize and convert to WebP using sharp
      const resized = await sharp(pngBuffer)
        .resize(this.coverWidth, this.coverHeight, { fit: 'cover' })
        .webp({ quality: this.coverQuality })
        .toBuffer();

      return resized;
    } catch (error) {
      console.error('PDF cover extraction failed:', error);
      return null;
    } finally {
      if (pdf) {
        try {
          await pdf.destroy();
        } catch (destroyError) {
          console.warn('Failed to cleanup PDF document after cover extraction:', destroyError);
        }
      }
    }
  }

  private async extractEPUBCover(epubPath: string): Promise<Buffer | null> {
    // Wrap extraction with timeout to prevent hanging on problematic files
    const extractionPromise = new Promise<Buffer | null>((resolve) => {
      try {
        const epub = new EPub(epubPath);

        epub.on('end', async () => {
          // Try to get cover from metadata
          const coverId = epub.metadata.cover;

          if (coverId && epub.manifest[coverId]) {
            epub.getImage(coverId, async (error, data, _mimeType) => {
              if (error || !data) {
                // Try fallback methods
                const fallback = await this.extractEPUBCoverFallback(epub);
                resolve(fallback);
                return;
              }

              try {
                // Resize and convert to WebP
                const resized = await sharp(data)
                  .resize(this.coverWidth, this.coverHeight, { fit: 'cover' })
                  .webp({ quality: this.coverQuality })
                  .toBuffer();

                resolve(resized);
              } catch {
                resolve(null);
              }
            });
          } else {
            // Try fallback methods
            const fallback = await this.extractEPUBCoverFallback(epub);
            resolve(fallback);
          }
        });

        epub.on('error', () => {
          resolve(null);
        });

        epub.parse();
      } catch {
        resolve(null);
      }
    });

    // Race between extraction and timeout
    return Promise.race([
      extractionPromise,
      new Promise<null>((resolve) =>
        setTimeout(() => {
          console.warn(`EPUB cover extraction timed out after ${EPUB_COVER_TIMEOUT_MS}ms`);
          resolve(null);
        }, EPUB_COVER_TIMEOUT_MS)
      ),
    ]);
  }

  private async extractEPUBCoverFallback(epub: EPub): Promise<Buffer | null> {
    // Strategy 1: Check for EPUB 3 cover-image property in manifest
    for (const [id, item] of Object.entries(epub.manifest)) {
      const properties = (item as { properties?: string }).properties;
      if (properties && properties.includes('cover-image')) {
        const result = await this.tryGetEpubImage(epub, id);
        if (result) return result;
      }
    }

    // Strategy 2: Check guide element for cover reference (EPUB 2)
    const guideResult = await this.extractCoverFromGuide(epub);
    if (guideResult) return guideResult;

    // Collect all images from manifest
    const images: Array<{ id: string; href: string }> = [];
    for (const [id, item] of Object.entries(epub.manifest)) {
      const href = (item as { href: string }).href;
      const mediaType = (item as { 'media-type': string })['media-type'];

      if (mediaType && mediaType.startsWith('image/')) {
        images.push({ id, href });
      }
    }

    // Strategy 3: Exact cover pattern matching (high confidence)
    // Check for exact "cover" id or filename first
    for (const { id, href } of images) {
      const idLower = id.toLowerCase();
      const filename = href.split('/').pop()?.toLowerCase() || '';
      const nameWithoutExt = filename.replace(/\.[^.]+$/, '');

      // Exact matches are most reliable
      if (idLower === 'cover' || nameWithoutExt === 'cover') {
        const result = await this.tryGetEpubImage(epub, id);
        if (result) return result;
      }
    }

    // Strategy 4: Pattern matching for common cover names
    for (const { id, href } of images) {
      const idLower = id.toLowerCase();
      const hrefLower = href.toLowerCase();

      if (
        EPUB_COVER_PATTERNS.some(p => idLower.includes(p)) ||
        EPUB_COVER_PATTERNS.some(p => hrefLower.includes(p))
      ) {
        const result = await this.tryGetEpubImage(epub, id);
        if (result) return result;
      }
    }

    // Strategy 5: Check if first spine item is a cover page with an image
    const coverPageResult = await this.extractCoverFromFirstSpineItem(epub);
    if (coverPageResult) return coverPageResult;

    // Strategy 6: Find the largest image (likely to be the cover)
    const largestImageResult = await this.findLargestImage(epub, images);
    if (largestImageResult) return largestImageResult;

    // Strategy 7: Last resort - try the first image in manifest
    if (images.length > 0) {
      const result = await this.tryGetEpubImage(epub, images[0].id);
      if (result) return result;
    }

    return null;
  }

  /**
   * Extract cover from EPUB 2 guide element
   * The guide can reference a cover page (HTML) which contains the cover image
   */
  private async extractCoverFromGuide(epub: EPub): Promise<Buffer | null> {
    const guide = (epub as unknown as { guide?: Array<{ type: string; href: string }> }).guide;
    if (!guide) return null;

    for (const ref of guide) {
      if (ref.type?.toLowerCase() === 'cover') {
        // The guide might reference an HTML page containing the cover
        // Find the manifest item for this href
        const coverHref = ref.href.split('#')[0]; // Remove fragment

        // First check if it's a direct image reference
        for (const [id, item] of Object.entries(epub.manifest)) {
          const itemHref = (item as { href: string }).href;
          const mediaType = (item as { 'media-type': string })['media-type'];

          if (itemHref === coverHref && mediaType?.startsWith('image/')) {
            const result = await this.tryGetEpubImage(epub, id);
            if (result) return result;
          }
        }

        // If it's an HTML page, try to extract the image from it
        const imageFromPage = await this.extractImageFromHtmlPage(epub, coverHref);
        if (imageFromPage) return imageFromPage;
      }
    }

    return null;
  }

  /**
   * Extract cover from the first spine item if it appears to be a cover page
   */
  private async extractCoverFromFirstSpineItem(epub: EPub): Promise<Buffer | null> {
    const spine = epub.spine;
    if (!spine?.contents?.length) return null;

    const firstItem = spine.contents[0];
    if (!firstItem?.id) return null;

    const manifestItem = epub.manifest[firstItem.id];
    if (!manifestItem) return null;

    const href = (manifestItem as { href: string }).href;
    const hrefLower = href.toLowerCase();

    // Only check if it looks like a cover page
    if (
      hrefLower.includes('cover') ||
      hrefLower.includes('title') ||
      hrefLower.includes('jacket')
    ) {
      const result = await this.extractImageFromHtmlPage(epub, href);
      if (result) return result;
    }

    return null;
  }

  /**
   * Extract the primary image from an HTML/XHTML page in the EPUB
   */
  private async extractImageFromHtmlPage(epub: EPub, pageHref: string): Promise<Buffer | null> {
    return new Promise((resolve) => {
      // Find the chapter by href
      let chapterId: string | null = null;
      for (const [id, item] of Object.entries(epub.manifest)) {
        if ((item as { href: string }).href === pageHref) {
          chapterId = id;
          break;
        }
      }

      if (!chapterId) {
        resolve(null);
        return;
      }

      epub.getChapter(chapterId, async (error, text) => {
        if (error || !text) {
          resolve(null);
          return;
        }

        // Parse the HTML to find image references
        // Look for <img> tags and <image> (SVG) tags
        const imgMatches = text.match(/<img[^>]+src=["']([^"']+)["']/gi) || [];
        const svgImageMatches = text.match(/<image[^>]+href=["']([^"']+)["']/gi) || [];
        const allMatches = [...imgMatches, ...svgImageMatches];

        for (const match of allMatches) {
          const srcMatch = match.match(/(?:src|href)=["']([^"']+)["']/i);
          if (!srcMatch) continue;

          const imgSrc = srcMatch[1];
          // Resolve relative path
          const basePath = pageHref.substring(0, pageHref.lastIndexOf('/') + 1);
          const resolvedSrc = imgSrc.startsWith('/')
            ? imgSrc.substring(1)
            : basePath + imgSrc;

          // Normalize path (handle ../)
          const normalizedSrc = this.normalizePath(resolvedSrc);

          // Find the image in manifest
          for (const [id, item] of Object.entries(epub.manifest)) {
            const itemHref = (item as { href: string }).href;
            if (itemHref === normalizedSrc || itemHref.endsWith(normalizedSrc)) {
              const result = await this.tryGetEpubImage(epub, id);
              if (result) {
                resolve(result);
                return;
              }
            }
          }
        }

        resolve(null);
      });
    });
  }

  /**
   * Find the largest image by dimensions (most likely to be a cover)
   */
  private async findLargestImage(
    epub: EPub,
    images: Array<{ id: string; href: string }>
  ): Promise<Buffer | null> {
    let largestImage: Buffer | null = null;
    let largestArea = 0;

    // Limit to first 10 images to avoid excessive processing
    const candidateImages = images.slice(0, 10);

    for (const { id } of candidateImages) {
      const imageData = await this.getEpubImageRaw(epub, id);
      if (!imageData) continue;

      try {
        const metadata = await sharp(imageData).metadata();
        const width = metadata.width || 0;
        const height = metadata.height || 0;

        // Skip tiny images (icons, bullets, etc.)
        if (width < MIN_COVER_DIMENSION || height < MIN_COVER_DIMENSION) {
          continue;
        }

        const area = width * height;

        // Prefer portrait-oriented images (typical cover aspect ratio)
        const aspectRatio = width / height;
        const isPortrait = aspectRatio >= 0.5 && aspectRatio <= 0.9;
        const adjustedArea = isPortrait ? area * 1.5 : area;

        if (adjustedArea > largestArea) {
          largestArea = adjustedArea;
          // Process the image
          largestImage = await sharp(imageData)
            .resize(this.coverWidth, this.coverHeight, { fit: 'cover' })
            .webp({ quality: this.coverQuality })
            .toBuffer();
        }
      } catch {
        // Skip images that can't be processed
        continue;
      }
    }

    return largestImage;
  }

  /**
   * Get raw image data from EPUB without processing
   */
  private getEpubImageRaw(epub: EPub, imageId: string): Promise<Buffer | null> {
    return new Promise((resolve) => {
      epub.getImage(imageId, (error, data) => {
        if (error || !data) {
          resolve(null);
          return;
        }
        resolve(data);
      });
    });
  }

  /**
   * Normalize a path by resolving ../ segments
   */
  private normalizePath(path: string): string {
    const parts = path.split('/');
    const normalized: string[] = [];

    for (const part of parts) {
      if (part === '..') {
        normalized.pop();
      } else if (part !== '.' && part !== '') {
        normalized.push(part);
      }
    }

    return normalized.join('/');
  }

  private async tryGetEpubImage(epub: EPub, imageId: string): Promise<Buffer | null> {
    return new Promise((resolve) => {
      epub.getImage(imageId, async (error, data) => {
        if (error || !data) {
          resolve(null);
          return;
        }

        try {
          const resized = await sharp(data)
            .resize(this.coverWidth, this.coverHeight, { fit: 'cover' })
            .webp({ quality: this.coverQuality })
            .toBuffer();

          resolve(resized);
        } catch {
          resolve(null);
        }
      });
    });
  }

  async invalidateCache(noteId: string): Promise<void> {
    const cachePath = this.getCachedCoverPath(noteId);
    if (existsSync(cachePath)) {
      const { unlink } = await import('node:fs/promises');
      await unlink(cachePath);
    }
  }
}
