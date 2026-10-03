import React from 'react';
import { cn } from '../../utils/cn';

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, action, className }) => (
  <div className={cn('flex flex-1 flex-col items-center justify-center text-center px-6 py-12', className)}>
    <div className="w-12 h-12 rounded-2xl bg-surface-raised border border-border/80 flex items-center justify-center mb-3 shadow-2xs">
      <Icon className="w-6 h-6 text-fg-subtle" />
    </div>
    <p className="text-sm font-semibold text-fg-muted">{title}</p>
    {description && <p className="text-xs text-fg-subtle mt-1 max-w-xs">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
