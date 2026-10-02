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
  compact?: boolean;
  contentClassName?: string;
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
  compact = false,
  contentClassName,
}) => {
  if (!open) return null;

  return (
    <ModalLayer variant="sheet" className="items-end justify-center md:items-center md:p-6" label={title} onClose={dismissable ? onClose : undefined}>
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
          'dialog-panel relative w-full min-h-0 flex flex-col bg-surface border-t md:border border-border rounded-t-2xl md:rounded-2xl overflow-hidden overscroll-contain shadow-2xl outline-none z-10',
          MAX_WIDTH_CLASSES[maxWidth]
        )}
      >
        <div className="md:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-border shrink-0" />

        <div className={cn(
          'flex items-center justify-between gap-3 border-b border-border shrink-0',
          compact ? 'px-3.5 py-2' : 'px-4 py-3'
        )}>
          <div className="min-w-0">
            <h2 className={cn('font-semibold text-fg leading-snug', compact ? 'text-sm' : 'text-base')}>{title}</h2>
            {subtitle && <p className="text-xs text-fg-subtle mt-0.5">{subtitle}</p>}
          </div>
          {dismissable && <IconButton icon={X} aria-label="Закрыть" onClick={onClose} size="sm" />}
        </div>

        <div
          className={cn(
            'flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]',
            compact ? 'p-2.5 sm:p-3' : cn('px-4 py-4', !footer && 'dialog-bottom-space'),
            contentClassName
          )}
        >
          {children}
        </div>

        {footer && (
          <div className={cn(
            'shrink-0 flex flex-wrap gap-2 border-t border-border',
            compact ? 'px-3 py-2' : 'dialog-bottom-space px-4 py-3'
          )}>
            {footer}
          </div>
        )}
      </div>
    </ModalLayer>
  );
};
