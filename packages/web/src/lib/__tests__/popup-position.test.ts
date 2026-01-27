import { describe, it, expect } from 'vitest';
import {
  calculatePopupPosition,
  calculatePopupPositionFromSelection,
} from '../popup-position';

/**
 * Helper to create a DOMRect-like object for testing
 */
function makeDOMRect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x,
    toJSON() {
      return { x, y, width, height, top: y, right: x + width, bottom: y + height, left: x };
    },
  };
}

describe('calculatePopupPosition', () => {
  const defaultContainer = makeDOMRect(0, 0, 800, 600);

  describe('horizontal positioning', () => {
    it('centers popup horizontally on the anchor', () => {
      const result = calculatePopupPosition({
        anchor: { x: 400, y: 100 },
        popupWidth: 200,
        popupHeight: 50,
        containerRect: defaultContainer,
      });

      // 400 - 200/2 = 300
      expect(result.x).toBe(300);
    });

    it('clamps popup to left edge with padding', () => {
      const result = calculatePopupPosition({
        anchor: { x: 20, y: 100 },
        popupWidth: 200,
        popupHeight: 50,
        containerRect: defaultContainer,
        padding: 10,
      });

      // 20 - 100 = -80, clamped to minX = 10
      expect(result.x).toBe(10);
    });

    it('clamps popup to right edge with padding', () => {
      const result = calculatePopupPosition({
        anchor: { x: 780, y: 100 },
        popupWidth: 200,
        popupHeight: 50,
        containerRect: defaultContainer,
        padding: 10,
      });

      // 780 - 100 = 680, maxX = 800 - 200 - 10 = 590
      expect(result.x).toBe(590);
    });

    it('handles zero padding', () => {
      const result = calculatePopupPosition({
        anchor: { x: 5, y: 100 },
        popupWidth: 200,
        popupHeight: 50,
        containerRect: defaultContainer,
        padding: 0,
      });

      // 5 - 100 = -95, clamped to minX = 0
      expect(result.x).toBe(0);
    });

    it('handles popup wider than container', () => {
      const result = calculatePopupPosition({
        anchor: { x: 400, y: 100 },
        popupWidth: 900,
        popupHeight: 50,
        containerRect: defaultContainer,
        padding: 10,
      });

      // maxX = 800 - 900 - 10 = -110, minX = 10
      // x = 400 - 450 = -50 => clamped to max(10, min(-110, -50)) = max(10, -110) = 10
      expect(result.x).toBe(10);
    });
  });

  describe('vertical positioning — preferred below', () => {
    it('places popup below anchor when there is enough space', () => {
      const result = calculatePopupPosition({
        anchor: { x: 400, y: 100 },
        popupWidth: 200,
        popupHeight: 50,
        containerRect: defaultContainer,
        gap: 10,
        preferredPlacement: 'below',
      });

      expect(result.y).toBe(110); // 100 + 10
      expect(result.placement).toBe('below');
    });

    it('flips to above when not enough space below', () => {
      const result = calculatePopupPosition({
        anchor: { x: 400, y: 550 },
        popupWidth: 200,
        popupHeight: 100,
        containerRect: defaultContainer,
        gap: 10,
        preferredPlacement: 'below',
      });

      // spaceBelow = 600 - 550 - 10 = 40 < 100
      // spaceAbove = 550 - 10 = 540 >= 100
      expect(result.y).toBe(440); // 550 - 100 - 10
      expect(result.placement).toBe('above');
    });

    it('defaults to below when neither direction has enough space', () => {
      // Very tall popup, small container
      const smallContainer = makeDOMRect(0, 0, 800, 100);
      const result = calculatePopupPosition({
        anchor: { x: 400, y: 50 },
        popupWidth: 200,
        popupHeight: 200,
        containerRect: smallContainer,
        gap: 10,
        preferredPlacement: 'below',
      });

      // spaceBelow = 100 - 50 - 10 = 40 < 200
      // spaceAbove = 50 - 10 = 40 < 200
      // Falls through to "below" default
      expect(result.y).toBe(60); // 50 + 10
      expect(result.placement).toBe('below');
    });
  });

  describe('vertical positioning — preferred above', () => {
    it('places popup above anchor when there is enough space', () => {
      const result = calculatePopupPosition({
        anchor: { x: 400, y: 300 },
        popupWidth: 200,
        popupHeight: 50,
        containerRect: defaultContainer,
        gap: 10,
        preferredPlacement: 'above',
      });

      // spaceAbove = 300 - 10 = 290 >= 50
      expect(result.y).toBe(240); // 300 - 50 - 10
      expect(result.placement).toBe('above');
    });

    it('flips to below when not enough space above', () => {
      const result = calculatePopupPosition({
        anchor: { x: 400, y: 30 },
        popupWidth: 200,
        popupHeight: 50,
        containerRect: defaultContainer,
        gap: 10,
        preferredPlacement: 'above',
      });

      // spaceAbove = 30 - 10 = 20 < 50
      // spaceBelow = 600 - 30 - 10 = 560 >= 50
      expect(result.y).toBe(40); // 30 + 10
      expect(result.placement).toBe('below');
    });

    it('defaults to above when neither direction has enough space', () => {
      const smallContainer = makeDOMRect(0, 0, 800, 100);
      const result = calculatePopupPosition({
        anchor: { x: 400, y: 50 },
        popupWidth: 200,
        popupHeight: 200,
        containerRect: smallContainer,
        gap: 10,
        preferredPlacement: 'above',
      });

      // spaceAbove = 50 - 10 = 40 < 200
      // spaceBelow = 100 - 50 - 10 = 40 < 200
      // Falls through to "above" default, y = 50 - 200 - 10 = -160, clamped to 10
      expect(result.y).toBe(10);
      expect(result.placement).toBe('above');
    });
  });

  describe('y clamping', () => {
    it('ensures y is never less than padding', () => {
      const result = calculatePopupPosition({
        anchor: { x: 400, y: 5 },
        popupWidth: 200,
        popupHeight: 100,
        containerRect: defaultContainer,
        gap: 10,
        padding: 15,
        preferredPlacement: 'above',
      });

      // Would place above: 5 - 100 - 10 = -105, clamped to padding=15
      expect(result.y).toBeGreaterThanOrEqual(15);
    });

    it('clamps y to default padding when calculated position is negative', () => {
      const result = calculatePopupPosition({
        anchor: { x: 400, y: 0 },
        popupWidth: 200,
        popupHeight: 50,
        containerRect: defaultContainer,
        gap: 10,
        preferredPlacement: 'above',
      });

      // Would flip to below since spaceAbove = 0 - 10 = -10 < 50
      // Below: y = 0 + 10 = 10, which equals default padding
      expect(result.y).toBe(10);
    });
  });

  describe('default parameter values', () => {
    it('uses default padding of 10', () => {
      const result = calculatePopupPosition({
        anchor: { x: 5, y: 100 },
        popupWidth: 200,
        popupHeight: 50,
        containerRect: defaultContainer,
      });

      // x = 5 - 100 = -95, clamped to default padding 10
      expect(result.x).toBe(10);
    });

    it('uses default gap of 10', () => {
      const result = calculatePopupPosition({
        anchor: { x: 400, y: 100 },
        popupWidth: 200,
        popupHeight: 50,
        containerRect: defaultContainer,
      });

      // Default gap = 10, so y = 100 + 10 = 110
      expect(result.y).toBe(110);
    });

    it('uses default preferred placement of below', () => {
      const result = calculatePopupPosition({
        anchor: { x: 400, y: 100 },
        popupWidth: 200,
        popupHeight: 50,
        containerRect: defaultContainer,
      });

      expect(result.placement).toBe('below');
    });
  });

  describe('edge cases', () => {
    it('handles anchor at exact container origin', () => {
      const result = calculatePopupPosition({
        anchor: { x: 0, y: 0 },
        popupWidth: 100,
        popupHeight: 50,
        containerRect: defaultContainer,
        padding: 10,
        gap: 10,
      });

      expect(result.x).toBe(10); // clamped to padding
      expect(result.y).toBe(10); // 0 + 10 = 10
      expect(result.placement).toBe('below');
    });

    it('handles anchor at bottom-right corner of container', () => {
      const result = calculatePopupPosition({
        anchor: { x: 800, y: 600 },
        popupWidth: 100,
        popupHeight: 50,
        containerRect: defaultContainer,
        padding: 10,
        gap: 10,
      });

      // x = 800 - 50 = 750, maxX = 800 - 100 - 10 = 690
      expect(result.x).toBe(690);
      // spaceBelow = 600 - 600 - 10 = -10 < 50
      // spaceAbove = 600 - 10 = 590 >= 50
      expect(result.placement).toBe('above');
      expect(result.y).toBe(540); // 600 - 50 - 10
    });

    it('handles very small container', () => {
      const tinyContainer = makeDOMRect(0, 0, 50, 50);
      const result = calculatePopupPosition({
        anchor: { x: 25, y: 25 },
        popupWidth: 200,
        popupHeight: 100,
        containerRect: tinyContainer,
        padding: 5,
        gap: 5,
      });

      // Popup is larger than container, x clamped to padding
      expect(result.x).toBe(5);
      // spaceBelow = 50 - 25 - 5 = 20 < 100
      // spaceAbove = 25 - 5 = 20 < 100
      // Falls to below default, y = 25 + 5 = 30
      expect(result.y).toBe(30);
    });

    it('handles zero-size popup', () => {
      const result = calculatePopupPosition({
        anchor: { x: 400, y: 300 },
        popupWidth: 0,
        popupHeight: 0,
        containerRect: defaultContainer,
        padding: 10,
        gap: 10,
      });

      // x = 400 - 0 = 400
      expect(result.x).toBe(400);
      expect(result.y).toBe(310);
      expect(result.placement).toBe('below');
    });

    it('handles exact fit below with no room to spare', () => {
      // Anchor at y=490, gap=10, popupHeight=100 => needs 100 space
      // spaceBelow = 600 - 490 - 10 = 100 => exactly fits
      const result = calculatePopupPosition({
        anchor: { x: 400, y: 490 },
        popupWidth: 200,
        popupHeight: 100,
        containerRect: defaultContainer,
        gap: 10,
        preferredPlacement: 'below',
      });

      expect(result.y).toBe(500);
      expect(result.placement).toBe('below');
    });

    it('flips when space below is one pixel short', () => {
      // spaceBelow = 600 - 491 - 10 = 99 < 100 => flip
      const result = calculatePopupPosition({
        anchor: { x: 400, y: 491 },
        popupWidth: 200,
        popupHeight: 100,
        containerRect: defaultContainer,
        gap: 10,
        preferredPlacement: 'below',
      });

      expect(result.placement).toBe('above');
      expect(result.y).toBe(381); // 491 - 100 - 10
    });

    it('handles custom gap value', () => {
      const result = calculatePopupPosition({
        anchor: { x: 400, y: 100 },
        popupWidth: 200,
        popupHeight: 50,
        containerRect: defaultContainer,
        gap: 20,
      });

      expect(result.y).toBe(120); // 100 + 20
    });

    it('handles custom padding value', () => {
      const result = calculatePopupPosition({
        anchor: { x: 5, y: 100 },
        popupWidth: 200,
        popupHeight: 50,
        containerRect: defaultContainer,
        padding: 25,
      });

      // x = 5 - 100 = -95, clamped to 25
      expect(result.x).toBe(25);
    });
  });

  describe('return value shape', () => {
    it('returns x, y, and placement', () => {
      const result = calculatePopupPosition({
        anchor: { x: 400, y: 300 },
        popupWidth: 200,
        popupHeight: 50,
        containerRect: defaultContainer,
      });

      expect(result).toHaveProperty('x');
      expect(result).toHaveProperty('y');
      expect(result).toHaveProperty('placement');
      expect(typeof result.x).toBe('number');
      expect(typeof result.y).toBe('number');
      expect(['above', 'below']).toContain(result.placement);
    });
  });
});

describe('calculatePopupPositionFromSelection', () => {
  const containerRect = makeDOMRect(100, 50, 800, 600);

  it('converts viewport coordinates to container-relative and positions below', () => {
    const result = calculatePopupPositionFromSelection({
      selectionRect: { x: 400, y: 200, bottom: 220 },
      containerRect,
      popupWidth: 200,
      popupHeight: 50,
      padding: 10,
      gap: 10,
    });

    // anchor.x = selectionRect.x - containerRect.left = 400 - 100 = 300
    // anchor.y = selectionRect.bottom - containerRect.top = 220 - 50 = 170
    // popup centered: 300 - 100 = 200
    expect(result.x).toBe(200);
    expect(result.y).toBe(180); // 170 + 10
    expect(result.placement).toBe('below');
  });

  it('converts y coordinate from selection bottom to container-relative', () => {
    const result = calculatePopupPositionFromSelection({
      selectionRect: { x: 500, y: 100, bottom: 130 },
      containerRect,
      popupWidth: 200,
      popupHeight: 50,
    });

    // anchor.y = 130 - 50 = 80
    // y = 80 + 10(default gap) = 90
    expect(result.y).toBe(90);
  });

  it('uses default padding and gap values', () => {
    const result = calculatePopupPositionFromSelection({
      selectionRect: { x: 500, y: 100, bottom: 130 },
      containerRect,
      popupWidth: 200,
      popupHeight: 50,
    });

    // Should not throw and should return valid result
    expect(result).toHaveProperty('x');
    expect(result).toHaveProperty('y');
    expect(result).toHaveProperty('placement');
  });

  it('handles selection near left edge of container', () => {
    const result = calculatePopupPositionFromSelection({
      selectionRect: { x: 110, y: 100, bottom: 120 },
      containerRect,
      popupWidth: 200,
      popupHeight: 50,
      padding: 10,
      gap: 10,
    });

    // anchor.x = 110 - 100 = 10, popup x = 10 - 100 = -90 => clamped to 10
    expect(result.x).toBe(10);
  });

  it('handles selection near bottom of container — flips above', () => {
    const result = calculatePopupPositionFromSelection({
      selectionRect: { x: 400, y: 620, bottom: 640 },
      containerRect,
      popupWidth: 200,
      popupHeight: 100,
      padding: 10,
      gap: 10,
    });

    // anchor.y = 640 - 50 = 590
    // spaceBelow = 600 - 590 - 10 = 0 < 100
    // spaceAbove = 590 - 10 = 580 >= 100
    expect(result.placement).toBe('above');
  });

  it('always uses below as preferred placement', () => {
    const result = calculatePopupPositionFromSelection({
      selectionRect: { x: 500, y: 200, bottom: 220 },
      containerRect,
      popupWidth: 200,
      popupHeight: 50,
    });

    // With plenty of space, should default to below
    expect(result.placement).toBe('below');
  });
});
