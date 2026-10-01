import { describe, expect, it } from 'vitest';
import { buildOffsets, visibleRange } from './virtualRange';

describe('virtual list range', () => {
  const offsets = buildOffsets(1000, () => 60);

  it('builds prefix sums from row heights', () => {
    expect(buildOffsets(3, (i) => [10, 20, 30][i])).toEqual([0, 10, 30, 60]);
  });

  it('renders only the rows in the viewport plus overscan', () => {
    // 600px viewport at the top: rows 0..9 visible, 5 extra below.
    expect(visibleRange(offsets, 0, 600, 5)).toEqual({ from: 0, to: 15 });
    // Scrolled to 30 000px: rows 500..509 visible.
    expect(visibleRange(offsets, 30000, 30600, 5)).toEqual({ from: 495, to: 515 });
  });

  it('includes a partly visible row at either edge', () => {
    expect(visibleRange(offsets, 30, 90, 0)).toEqual({ from: 0, to: 2 });
  });

  it('stays inside the list at the end and when the viewport is above the list', () => {
    expect(visibleRange(offsets, 59900, 60500, 5)).toEqual({ from: 993, to: 1000 });
    expect(visibleRange(offsets, -400, 200, 2)).toEqual({ from: 0, to: 6 });
    expect(visibleRange(buildOffsets(0, () => 60), 0, 600, 5)).toEqual({ from: 0, to: 0 });
  });

  it('handles rows of different heights', () => {
    const mixed = buildOffsets(5, (i) => (i === 2 ? 300 : 50));
    // Viewport 120..380 covers row 2 (100..400) only.
    expect(visibleRange(mixed, 120, 380, 0)).toEqual({ from: 2, to: 3 });
  });
});
