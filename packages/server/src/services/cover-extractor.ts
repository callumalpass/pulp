import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';
import EPub from 'epub2';
import type { Config } from '../config/schema.js';

const COVER_WIDTH = 300;
const COVER_HEIGHT = 450;

export class CoverExtractor {
  private cacheDir: string;

  constructor(config: Config) {
    this.cacheDir = join(config.library_path, '.pulp-cache', 'covers');
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
  }

  private async extractPDFCover(pdfPath: string): Promise<Buffer | null> {
    try {
      const data = new Uint8Array(readFileSync(pdfPath));
      const pdf = await pdfjsLib.getDocument({ data }).promise;
      const page = await pdf.getPage(1);

      // Calculate scale to fit desired dimensions (render at 2x for quality)
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(
        (COVER_WIDTH * 2) / viewport.width,
        (COVER_HEIGHT * 2) / viewport.height
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
        .resize(COVER_WIDTH, COVER_HEIGHT, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();

      await pdf.destroy();
      return resized;
    } catch (error) {
      console.error('PDF cover extraction failed:', error);
      return null;
    }
  }

  private async extractEPUBCover(epubPath: string): Promise<Buffer | null> {
    return new Promise((resolve) => {
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
                  .resize(COVER_WIDTH, COVER_HEIGHT, { fit: 'cover' })
                  .webp({ quality: 80 })
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
  }

  private async extractEPUBCoverFallback(epub: EPub): Promise<Buffer | null> {
    // First, check for EPUB 3 cover-image property
    for (const [id, item] of Object.entries(epub.manifest)) {
      const properties = (item as { properties?: string }).properties;
      if (properties && properties.includes('cover-image')) {
        const result = await this.tryGetEpubImage(epub, id);
        if (result) return result;
      }
    }

    // Look for common cover image names in manifest
    const coverPatterns = ['cover', 'cover-image', 'coverimage', 'frontcover'];
    const images: Array<{ id: string; href: string }> = [];

    for (const [id, item] of Object.entries(epub.manifest)) {
      const href = (item as { href: string }).href;
      const mediaType = (item as { 'media-type': string })['media-type'];

      if (mediaType && mediaType.startsWith('image/')) {
        images.push({ id, href });
      }
    }

    // Try pattern matching first
    for (const { id, href } of images) {
      const idLower = id.toLowerCase();
      const hrefLower = href.toLowerCase();

      if (
        coverPatterns.some(p => idLower.includes(p)) ||
        coverPatterns.some(p => hrefLower.includes(p))
      ) {
        const result = await this.tryGetEpubImage(epub, id);
        if (result) return result;
      }
    }

    // Last resort: try the first image in the manifest
    if (images.length > 0) {
      const result = await this.tryGetEpubImage(epub, images[0].id);
      if (result) return result;
    }

    return null;
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
            .resize(COVER_WIDTH, COVER_HEIGHT, { fit: 'cover' })
            .webp({ quality: 80 })
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
