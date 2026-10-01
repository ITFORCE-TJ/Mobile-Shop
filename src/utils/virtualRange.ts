/** Prefix sums of row heights: offsets[i] is the top of row i, offsets[count] the total height. */
export function buildOffsets(count: number, sizeOf: (index: number) => number): number[] {
  const offsets = new Array<number>(count + 1);
  offsets[0] = 0;
  for (let i = 0; i < count; i++) offsets[i + 1] = offsets[i] + sizeOf(i);
  return offsets;
}

/** First row whose bottom edge is below `y` (binary search over the prefix sums). */
function firstRowEndingAfter(offsets: number[], y: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1] > y) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Rows to render for a viewport [start, end) measured from the top of the list, plus
 * `overscan` rows on each side so fast scrolling does not show blank space.
 * Returns a half-open range [from, to).
 */
export function visibleRange(offsets: number[], start: number, end: number, overscan: number): { from: number; to: number } {
  const count = offsets.length - 1;
  if (count <= 0) return { from: 0, to: 0 };
  const total = offsets[count];
  const top = Math.max(0, Math.min(start, total));
  const bottom = Math.max(top, Math.min(end, total));
  const first = Math.min(firstRowEndingAfter(offsets, top), count - 1);
  let last = first;
  while (last < count && offsets[last] < bottom) last++;
  return { from: Math.max(0, first - overscan), to: Math.min(count, Math.max(last, first + 1) + overscan) };
}
