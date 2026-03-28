interface EpubLocationsLike {
  length(): number;
  percentageFromCfi?: (cfi: string) => number;
  cfiFromPercentage?: (percentage: number) => string | null | undefined;
}

interface EpubLocationsCacheKeyParams {
  noteId: string;
  sourceRelative: string;
  fontSize: number;
  lineHeight: number;
  width: number;
  height: number;
}

const LOCATION_CACHE_VERSION = 2;
const DIMENSION_BUCKET_PX = 50;
export const EPUB_LOCATION_GENERATION_BREAKPOINT = 1024;
export const DEFAULT_EPUB_TOTAL_PAGES_ESTIMATE = 100;

export function loadCachedEpubLocations(cacheKey: string): string[] {
  const cachedLocations = localStorage.getItem(cacheKey);
  if (!cachedLocations) {
    return [];
  }

  try {
    const parsed = JSON.parse(cachedLocations);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function saveCachedEpubLocations(cacheKey: string, locations: string[]): void {
  try {
    localStorage.setItem(cacheKey, JSON.stringify(locations));
  } catch {
    // localStorage full or unavailable; ignore cache write failures.
  }
}

function clampPercentage(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, progress));
}

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function bucketDimension(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(DIMENSION_BUCKET_PX, Math.round(value / DIMENSION_BUCKET_PX) * DIMENSION_BUCKET_PX);
}

export function createEpubLocationsCacheKey(params: EpubLocationsCacheKeyParams): string {
  const widthBucket = bucketDimension(params.width);
  const heightBucket = bucketDimension(params.height);
  const normalizedLineHeight = Math.round(params.lineHeight * 100) / 100;

  return [
    'epub-locations',
    `v${LOCATION_CACHE_VERSION}`,
    params.noteId,
    params.sourceRelative,
    `fs${params.fontSize}`,
    `lh${normalizedLineHeight}`,
    `${widthBucket}x${heightBucket}`,
  ].join('-');
}

export function getProgressFromEpubLocation(
  locations: EpubLocationsLike,
  cfi: string | null | undefined,
  locationIndex: number
): number | null {
  if (cfi && typeof locations.percentageFromCfi === 'function') {
    const rawPercentage = locations.percentageFromCfi(cfi);
    if (Number.isFinite(rawPercentage)) {
      if (rawPercentage >= 0 && rawPercentage <= 1) {
        return clampPercentage(rawPercentage * 100);
      }

      return clampPercentage(rawPercentage);
    }
  }

  const totalLocations = locations.length();
  if (totalLocations > 0 && locationIndex >= 0) {
    return clampPercentage(((locationIndex + 1) / totalLocations) * 100);
  }

  return null;
}

export function getCfiFromProgress(
  locations: EpubLocationsLike,
  fallbackLocations: string[],
  progress: number
): string | null {
  const normalizedProgress = clampPercentage(progress);
  const fraction = clampFraction(normalizedProgress / 100);

  if (typeof locations.cfiFromPercentage === 'function') {
    const cfi = locations.cfiFromPercentage(fraction);
    if (typeof cfi === 'string' && cfi.trim()) {
      return cfi;
    }
  }

  if (fallbackLocations.length === 0) {
    return null;
  }

  const maxIndex = fallbackLocations.length - 1;
  const index = Math.min(maxIndex, Math.max(0, Math.floor(fraction * maxIndex)));
  return fallbackLocations[index] || null;
}

export function getPreferredEpubRestoreTarget(
  savedCfi: string | null | undefined,
  progress: number,
  locations: EpubLocationsLike,
  fallbackLocations: string[]
): string | null {
  if (savedCfi && savedCfi.trim()) {
    return savedCfi;
  }

  if (progress <= 0) {
    return null;
  }

  return getCfiFromProgress(locations, fallbackLocations, progress);
}

export function normalizeEpubHref(href: string): string {
  if (!href) return '';
  const trimmedHref = href.trim();
  const decodedHref = (() => {
    try {
      return decodeURI(trimmedHref);
    } catch {
      return trimmedHref;
    }
  })();
  return decodedHref.replace(/^[./]+/, '').replace(/\?.*$/, '');
}

export function getBaseEpubHref(href: string): string {
  return normalizeEpubHref(href).split('#')[0];
}

export function epubHrefsMatch(firstHref: string, secondHref: string): boolean {
  if (!firstHref || !secondHref) return false;
  return firstHref === secondHref || firstHref.endsWith(secondHref) || secondHref.endsWith(firstHref);
}

export interface EpubTocItemLike {
  href: string;
  label: string;
  subitems?: EpubTocItemLike[];
}

export function findEpubChapter<T extends EpubTocItemLike>(items: T[], href: string): T | null {
  const targetBaseHref = getBaseEpubHref(href);

  for (const item of items) {
    const itemBaseHref = getBaseEpubHref(item.href);
    if (epubHrefsMatch(targetBaseHref, itemBaseHref)) {
      return item;
    }
    if (item.subitems) {
      const found = findEpubChapter(item.subitems as T[], href);
      if (found) {
        return found;
      }
    }
  }

  return null;
}
