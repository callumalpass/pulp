/**
 * Popup positioning utility for highlight popups
 * Calculates optimal position relative to selection while staying within bounds
 */

export type PopupPlacement = 'below' | 'above';

export interface PopupPosition {
  x: number;
  y: number;
  placement: PopupPlacement;
}

export interface CalculatePopupPositionOptions {
  /** Selection or anchor position (relative to container) */
  anchor: { x: number; y: number };
  /** Width of the popup */
  popupWidth: number;
  /** Height of the popup (estimated) */
  popupHeight: number;
  /** Container bounds (the reader container) */
  containerRect: DOMRect;
  /** Padding from container edges */
  padding?: number;
  /** Gap between anchor and popup */
  gap?: number;
  /** Preferred placement (will flip if not enough space) */
  preferredPlacement?: PopupPlacement;
}

/**
 * Calculate optimal popup position relative to an anchor point.
 * - Centers horizontally relative to anchor
 * - Clamps to container bounds
 * - Flips above anchor if insufficient space below
 */
export function calculatePopupPosition({
  anchor,
  popupWidth,
  popupHeight,
  containerRect,
  padding = 10,
  gap = 10,
  preferredPlacement = 'below',
}: CalculatePopupPositionOptions): PopupPosition {
  // Calculate horizontal position (centered on anchor, clamped to bounds)
  const halfWidth = popupWidth / 2;
  let x = anchor.x - halfWidth;

  // Clamp to container bounds
  const minX = padding;
  const maxX = containerRect.width - popupWidth - padding;
  x = Math.max(minX, Math.min(maxX, x));

  // Calculate vertical position with flip logic
  let y: number;
  let placement: PopupPlacement;

  // Check if there's enough space below
  const spaceBelow = containerRect.height - anchor.y - gap;
  const spaceAbove = anchor.y - gap;

  if (preferredPlacement === 'below') {
    if (spaceBelow >= popupHeight) {
      // Enough space below
      y = anchor.y + gap;
      placement = 'below';
    } else if (spaceAbove >= popupHeight) {
      // Flip to above
      y = anchor.y - popupHeight - gap;
      placement = 'above';
    } else {
      // Not enough space either way, position below and let it scroll
      y = anchor.y + gap;
      placement = 'below';
    }
  } else {
    // Preferred above
    if (spaceAbove >= popupHeight) {
      y = anchor.y - popupHeight - gap;
      placement = 'above';
    } else if (spaceBelow >= popupHeight) {
      y = anchor.y + gap;
      placement = 'below';
    } else {
      y = anchor.y - popupHeight - gap;
      placement = 'above';
    }
  }

  // Ensure y is not negative
  y = Math.max(padding, y);

  return { x, y, placement };
}

/**
 * Calculate popup position from a screen-relative selection position.
 * Converts from viewport coordinates to container-relative coordinates.
 */
export function calculatePopupPositionFromSelection({
  selectionRect,
  containerRect,
  popupWidth,
  popupHeight,
  padding = 10,
  gap = 10,
}: {
  /** Selection bounding rect (viewport coordinates) */
  selectionRect: { x: number; y: number; bottom: number };
  /** Container element bounding rect */
  containerRect: DOMRect;
  popupWidth: number;
  popupHeight: number;
  padding?: number;
  gap?: number;
}): PopupPosition {
  // Convert selection position to container-relative
  const anchor = {
    x: selectionRect.x - containerRect.left,
    y: selectionRect.bottom - containerRect.top,
  };

  return calculatePopupPosition({
    anchor,
    popupWidth,
    popupHeight,
    containerRect,
    padding,
    gap,
    preferredPlacement: 'below',
  });
}
