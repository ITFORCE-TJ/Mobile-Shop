import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '../../utils/cn';

export type StatusTone = 'success' | 'error' | 'warning' | 'info';

export interface StatusMessage {
  tone: StatusTone;
  text: string;
}

const TONE_CONFIG: Record<StatusTone, { icon: React.ElementType; classes: string; autoDismissMs: number | null }> = {
  success: { icon: CheckCircle2, classes: 'bg-success/15 border-success/30 text-success', autoDismissMs: 3500 },
  info: { icon: Info, classes: 'bg-info/15 border-info/30 text-info', autoDismissMs: 3500 },
  warning: { icon: AlertTriangle, classes: 'bg-warning/15 border-warning/30 text-warning', autoDismissMs: null },
  error: { icon: AlertCircle, classes: 'bg-danger/15 border-danger/30 text-danger', autoDismissMs: null },
};

interface StatusBannerProps {
  message: StatusMessage | null;
  onDismiss: () => void;
}

/**
 * App-wide toast: fixed to the top of the viewport so it's never scrolled out of
 * view (a real bug seen on pages whose success banner rendered inline at the top
 * of a long scrollable page). Success/info auto-dismiss; warning/error require
 * an explicit tap so a financial mistake can't scroll away unnoticed.
 */
export const StatusBanner: React.FC<StatusBannerProps> = ({ message, onDismiss }) => {
  const tone = message?.tone;

  useEffect(() => {
    if (!message) return;
    const ms = TONE_CONFIG[message.tone].autoDismissMs;
    if (ms == null) return;
    const t = setTimeout(onDismiss, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  if (!message || !tone) return null;
  const { icon: Icon, classes } = TONE_CONFIG[tone];

  return (
    <div className="fixed top-[calc(0.75rem+var(--sa-top))] inset-x-[calc(0.75rem+max(var(--sa-left),var(--sa-right)))] z-100 flex justify-center pointer-events-none">
      <div
        role="status"
        className={cn(
          'pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-none max-w-md w-full',
          classes
        )}
      >
        <Icon className="w-4 h-4 shrink-0 mt-0.5" />
        <span className="flex-1 min-w-0">{message.text}</span>
        <button type="button" onClick={onDismiss} aria-label="Закрыть" className="shrink-0 opacity-70 hover:opacity-100">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
