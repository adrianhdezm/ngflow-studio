import {
  clamp,
  flowToScreen,
  getBezierPath,
  getBounds,
  getFallbackAnchor,
  getHandleAnchor,
  getViewportForBounds,
  getVisibleFlowRect,
  hitTest,
  interpolateViewport,
  pointInRect,
  screenToFlow,
  zoomAtPoint
} from './geometry';

describe('geometry', () => {
  describe('coordinate transforms', () => {
    const viewport = { x: 100, y: 50, zoom: 2 };

    it('converts screen to flow coordinates', () => {
      expect(screenToFlow({ x: 300, y: 250 }, viewport)).toEqual({ x: 100, y: 100 });
    });

    it('converts flow to screen coordinates', () => {
      expect(flowToScreen({ x: 100, y: 100 }, viewport)).toEqual({ x: 300, y: 250 });
    });

    it('round-trips', () => {
      const p = { x: 12.5, y: -40 };
      expect(screenToFlow(flowToScreen(p, viewport), viewport)).toEqual(p);
    });
  });

  describe('zoomAtPoint', () => {
    it('keeps the anchor point fixed on screen', () => {
      const viewport = { x: 10, y: 20, zoom: 1 };
      const anchor = { x: 200, y: 150 };
      const before = screenToFlow(anchor, viewport);
      const next = zoomAtPoint(viewport, anchor, 1.5, 0.5, 2);
      expect(next.zoom).toBe(1.5);
      const after = screenToFlow(anchor, next);
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
    });

    it('clamps the zoom', () => {
      expect(zoomAtPoint({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 10, 0.5, 2).zoom).toBe(2);
      expect(zoomAtPoint({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 0.01, 0.5, 2).zoom).toBe(0.5);
    });
  });

  describe('bounds', () => {
    it('returns the union of rects', () => {
      expect(
        getBounds([
          { x: 0, y: 0, width: 10, height: 10 },
          { x: 20, y: -5, width: 5, height: 5 }
        ])
      ).toEqual({ x: 0, y: -5, width: 25, height: 15 });
    });

    it('returns an empty rect for no input', () => {
      expect(getBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });
  });

  describe('fit view math', () => {
    it('centers the bounds and respects maxZoom', () => {
      const vp = getViewportForBounds({ x: 0, y: 0, width: 192, height: 192 }, { width: 1000, height: 800 }, 0.5, 1, 0.2);
      expect(vp.zoom).toBe(1);
      expect(vp.x).toBe(500 - 96);
      expect(vp.y).toBe(400 - 96);
    });

    it('zooms out to fit large content, honoring padding', () => {
      const vp = getViewportForBounds({ x: 0, y: 0, width: 2000, height: 500 }, { width: 1000, height: 800 }, 0.1, 2, 0.25);
      expect(vp.zoom).toBeCloseTo(1000 / 2500);
      // Content center lands in the container center.
      expect(vp.x + 1000 * vp.zoom).toBeCloseTo(500);
      expect(vp.y + 250 * vp.zoom).toBeCloseTo(400);
    });

    it('clamps to minZoom', () => {
      const vp = getViewportForBounds({ x: 0, y: 0, width: 100000, height: 100 }, { width: 1000, height: 800 }, 0.5, 2, 0.2);
      expect(vp.zoom).toBe(0.5);
    });

    it('computes the visible flow rect', () => {
      expect(getVisibleFlowRect({ x: -100, y: -50, zoom: 2 }, { width: 400, height: 200 })).toEqual({
        x: 50,
        y: 25,
        width: 200,
        height: 100
      });
    });
  });

  describe('hit testing', () => {
    const rects = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 50, y: 50, width: 100, height: 100 }
    ];

    it('checks point containment', () => {
      expect(pointInRect({ x: 5, y: 5 }, rects[0])).toBe(true);
      expect(pointInRect({ x: 101, y: 5 }, rects[0])).toBe(false);
    });

    it('returns the topmost rect', () => {
      expect(hitTest({ x: 75, y: 75 }, rects)?.id).toBe('b');
      expect(hitTest({ x: 10, y: 10 }, rects)?.id).toBe('a');
      expect(hitTest({ x: 500, y: 500 }, rects)).toBeUndefined();
    });
  });

  describe('anchors', () => {
    it('attaches to the outer edge of a handle', () => {
      const handle = { x: -6, y: 90, width: 12, height: 12 };
      expect(getHandleAnchor({ x: 100, y: 100 }, { ...handle, position: 'left' })).toEqual({ x: 94, y: 196 });
      expect(getHandleAnchor({ x: 100, y: 100 }, { ...handle, position: 'right' })).toEqual({ x: 106, y: 196 });
    });

    it('falls back to the side midpoint', () => {
      const rect = { x: 0, y: 0, width: 192, height: 192 };
      expect(getFallbackAnchor(rect, 'right')).toEqual({ x: 192, y: 96 });
      expect(getFallbackAnchor(rect, 'left')).toEqual({ x: 0, y: 96 });
      expect(getFallbackAnchor(rect, 'top')).toEqual({ x: 96, y: 0 });
      expect(getFallbackAnchor(rect, 'bottom')).toEqual({ x: 96, y: 192 });
    });
  });

  describe('getBezierPath', () => {
    it('builds a cubic curve with horizontal control points', () => {
      const { path, labelX, labelY } = getBezierPath({ sourceX: 0, sourceY: 0, targetX: 100, targetY: 100 });
      expect(path).toBe('M0,0 C50,0 50,100 100,100');
      expect(labelX).toBe(50);
      expect(labelY).toBe(50);
    });

    it('bends outwards when the target is behind the source', () => {
      const { path } = getBezierPath({ sourceX: 100, sourceY: 0, targetX: 0, targetY: 0 });
      const [, c1x] = /C(-?[\d.]+)/.exec(path)!;
      expect(Number(c1x)).toBeGreaterThan(100);
    });
  });

  it('interpolates viewports and clamps values', () => {
    expect(interpolateViewport({ x: 0, y: 0, zoom: 1 }, { x: 10, y: 20, zoom: 2 }, 0.5)).toEqual({ x: 5, y: 10, zoom: 1.5 });
    expect(clamp(5, 0, 3)).toBe(3);
  });
});
