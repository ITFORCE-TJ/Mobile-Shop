import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildOffsets, visibleRange } from '../utils/virtualRange';

/**
 * The ancestor that actually scrolls vertically. `overflow-x: auto` (e.g. a table wrapper) also
 * computes overflow-y to auto, so an ancestor counts only when its content is taller than it.
 */
function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
}

interface Options {
  count: number;
  /** Height used for rows not measured yet. */
  estimateSize: number;
  overscan?: number;
  /** Lists up to this size render in full (no spacers, nothing to save). */
  threshold?: number;
  /** Changes when the rows change meaning (filter, sort, layout): measured heights are dropped. */
  resetKey?: string;
}

/**
 * Renders only the rows near the viewport of the nearest scrolling ancestor, with spacer
 * padding for the rest. Row heights are measured as rows mount, so rows of different heights
 * (wrapping badges, a second IMEI) still line up. Works with any element type, table rows too.
 */
export function useVirtualRows<T extends HTMLElement>({ count, estimateSize, overscan = 8, threshold = 80, resetKey = '' }: Options) {
  const enabled = count > threshold;
  const listRef = useRef<T | null>(null);
  const sizes = useRef(new Map<number, number>());
  const [sizeVersion, setSizeVersion] = useState(0);
  const [viewport, setViewport] = useState({ start: 0, end: 1200 });
  const frame = useRef<number | null>(null);

  useEffect(() => {
    sizes.current.clear();
    setSizeVersion((v) => v + 1);
  }, [resetKey]);

  const update = useCallback(() => {
    const list = listRef.current;
    const scroller = getScrollParent(list);
    if (!list || !scroller) return;
    const listTop = list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const start = scroller.scrollTop - listTop;
    const next = { start, end: start + scroller.clientHeight };
    setViewport((prev) => (Math.abs(prev.start - next.start) < 1 && Math.abs(prev.end - next.end) < 1 ? prev : next));
  }, []);

  useLayoutEffect(() => {
    if (!enabled) return;
    const scroller = getScrollParent(listRef.current);
    if (!scroller) return;
    const onScroll = () => {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => { frame.current = null; update(); });
    };
    update();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    const resize = new ResizeObserver(() => {
      // A new width can re-wrap rows: measure again.
      sizes.current.clear();
      setSizeVersion((v) => v + 1);
      update();
    });
    resize.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      resize.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [enabled, update, resetKey]);

  const offsets = useMemo(
    () => (enabled ? buildOffsets(count, (i) => sizes.current.get(i) ?? estimateSize) : []),
    // sizeVersion: the measured heights live in a ref and change between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, count, estimateSize, sizeVersion]
  );

  const { from, to } = enabled ? visibleRange(offsets, viewport.start, viewport.end, overscan) : { from: 0, to: count };
  const padTop = enabled ? offsets[from] : 0;
  const padBottom = enabled ? offsets[count] - offsets[to] : 0;

  /** Ref for row `index`: records its real height once it is on screen. */
  const measure = useCallback((index: number) => (el: HTMLElement | null) => {
    if (!el || !enabled) return;
    const height = el.getBoundingClientRect().height;
    if (height > 0 && Math.abs((sizes.current.get(index) ?? -1) - height) > 0.5) {
      sizes.current.set(index, height);
      setSizeVersion((v) => v + 1);
    }
  }, [enabled]);

  return { listRef, from, to, padTop, padBottom, measure, enabled };
}
