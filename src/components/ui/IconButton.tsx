import React from 'react';
import { cn } from '../../utils/cn';

type Tone = 'default' | 'accent' | 'danger';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ElementType;
  tone?: Tone;
  size?: 'md' | 'sm';
  'aria-label': string;
}

const TONE_CLASSES: Record<Tone, string> = {
  default: 'text-fg-muted hover:text-fg hover:bg-surface-raised active:bg-surface-raised',
  accent: 'text-accent bg-accent/10 border border-accent/30 hover:bg-accent/15',
  danger: 'text-danger bg-danger/10 border border-danger/30 hover:bg-danger/15',
};

/** Square, always-tappable icon button — never relies on hover to be usable on touch. */
export const IconButton: React.FC<IconButtonProps> = ({
  icon: Icon,
  tone = 'default',
  size = 'md',
  className,
  ...rest
}) => {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center shrink-0 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed active:scale-95',
        size === 'md' ? 'w-11 h-11' : 'w-11 h-11 md:w-9 md:h-9',
        TONE_CLASSES[tone],
        className
      )}
      {...rest}
    >
      <Icon className={size === 'md' ? 'w-5 h-5' : 'w-4 h-4'} />
    </button>
  );
};
