import React from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { IconButton } from './IconButton';
import { ModalLayer } from './ModalLayer';

type MaxWidth = 'sm' | 'md' | 'lg' | 'xl';

const MAX_WIDTH_CLASSES: Record<MaxWidth, string> = {
  sm: 'md:max-w-sm',
  md: 'md:max-w-md',
  lg: 'md:max-w-lg',
  xl: 'md:max-w-2xl',
};

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: MaxWidth;
  /** Set false for a modal the user must act on (e.g. setting today's mandatory exchange rate) — hides the close button and disables backdrop/Escape dismissal. */
  dismissable?: boolean;
}

/**
 * One dialog shell for the whole app: a bottom sheet on phones (native, thumb-reachable
 * close/actions near the bottom of the screen) and a centered modal from tablet width up.
 * Replaces ~30 hand-rolled modal shells that previously each picked their own width,
 * backdrop opacity, and corner radius.
 */
export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'md',
  dismissable = true,
}) => {
  if (!open) return null;

  return (
    <ModalLayer variant="sheet" label={title} onClose={dismissable ? onClose : undefined}>
      <div
        className="absolute inset-0 bg-black/70 transition-opacity"
        onClick={dismissable ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'dialog-panel relative w-full min-h-0 flex flex-col bg-surface border-t md:border border-border rounded-t-2xl md:rounded-2xl overflow-hidden overscroll-contain shadow-2xl z-10',
          MAX_WIDTH_CLASSES[maxWidth]
        )}
      >
        <div className="md:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-border shrink-0" />

        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-fg leading-snug">{title}</h2>
            {subtitle && <p className="text-xs text-fg-subtle mt-1">{subtitle}</p>}
          </div>
          {dismissable && <IconButton icon={X} aria-label="Закрыть" onClick={onClose} size="sm" />}
        </div>

        <div
          className={cn(
            'flex-1 min-h-0 overflow-y-auto px-4 py-4 overscroll-contain [-webkit-overflow-scrolling:touch]',
            !footer && 'dialog-bottom-space'
          )}
        >
          {children}
        </div>

        {footer && (
          <div className="dialog-bottom-space shrink-0 flex flex-wrap gap-2 px-4 py-3 border-t border-border">
            {footer}
          </div>
        )}
      </div>
    </ModalLayer>
  );
};
