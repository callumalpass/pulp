import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';

const require = createRequire(import.meta.url);
const pdfjsPackagePath = require.resolve('pdfjs-dist/package.json');
const pdfjsRootDir = dirname(pdfjsPackagePath);

function toDirectoryPath(path: string): string {
  return path.endsWith(sep) ? path : `${path}${sep}`;
}

const STANDARD_FONT_DATA_URL = toDirectoryPath(join(pdfjsRootDir, 'standard_fonts'));
const CMAP_URL = toDirectoryPath(join(pdfjsRootDir, 'cmaps'));

export function toUint8ArrayView(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

export function buildPdfDocumentOptions(data: Uint8Array): {
  data: Uint8Array;
  standardFontDataUrl: string;
  cMapUrl: string;
  cMapPacked: boolean;
} {
  return {
    data,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
  };
}
