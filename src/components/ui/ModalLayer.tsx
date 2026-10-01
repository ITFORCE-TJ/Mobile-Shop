import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';

const layers: HTMLElement[] = [];
let previousOverflow = '';
let previousRootInert = false;
const focusable = 'button, a[href], input, select, textarea, [tabindex]';

interface ModalLayerProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'legacy' | 'sheet' | 'fullscreen';
  onClose?: () => void;
  label?: string;
}

/** One viewport and focus boundary for both migrated dialogs and legacy forms. */
export function ModalLayer({ children, className, variant = 'legacy', onClose, label }: ModalLayerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const layer = ref.current!;
    const root = document.getElementById('root');
    const previousFocus = document.activeElement as HTMLElement | null;
    if (!layers.length) {
      previousOverflow = document.body.style.overflow;
      previousRootInert = root?.inert ?? false;
      document.body.style.overflow = 'hidden';
      if (root) root.inert = true;
    }
    layers.at(-1)?.setAttribute('inert', '');
    layers.push(layer);
    layer.style.zIndex = String(60 + layers.length * 2);
    document.documentElement.setAttribute('data-modal-open', '');
    const panel = layer.querySelector<HTMLElement>('[role="dialog"]') ?? layer.firstElementChild as HTMLElement;
    if (panel) {
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.tabIndex = -1;
      if (!panel.hasAttribute('aria-label')) {
        panel.setAttribute('aria-label', label ?? panel.querySelector('h2, h3, h4')?.textContent ?? 'Диалог');
      }
      // Focus the panel, not an input: opening a dialog should not summon the keyboard.
      panel.focus({ preventScroll: true });
    }
    const onFocus = (event: FocusEvent) => {
      if (layers.at(-1) === layer && !layer.contains(event.target as Node)) panel?.focus({ preventScroll: true });
    };
    const onKey = (event: KeyboardEvent) => {
      if (layers.at(-1) !== layer || event.defaultPrevented) return;
      if (event.key === 'Escape' && closeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const targets = [...layer.querySelectorAll<HTMLElement>(focusable)].filter(el =>
        el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[inert]') &&
        el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
      const first = targets[0];
      const last = targets.at(-1);
      if (!first) { event.preventDefault(); panel?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !targets.includes(document.activeElement as HTMLElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !targets.includes(document.activeElement as HTMLElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('keydown', onKey);
      const wasTop = layers.at(-1) === layer;
      layers.splice(layers.indexOf(layer), 1);
      layers.at(-1)?.removeAttribute('inert');
      if (!layers.length) {
        document.body.style.overflow = previousOverflow;
        if (root) root.inert = previousRootInert;
        document.documentElement.removeAttribute('data-modal-open');
      }
      if (wasTop && previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus({ preventScroll: true });
    };
  }, [label]);

  return createPortal(
    <div
      ref={ref}
      data-modal-layer
      className={cn('fixed inset-0 z-60 flex overflow-hidden modal-layer', `modal-${variant}`, className)}
    >
      {children}
    </div>,
    document.body,
  );
}
