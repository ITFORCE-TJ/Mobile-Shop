import React, { useState } from 'react';
import { MoreHorizontal, ChevronRight } from 'lucide-react';
import { Dialog } from './Dialog';
import { IconButton } from './IconButton';
import { cn } from '../../utils/cn';

export interface ActionMenuItem {
  label: string;
  description?: string;
  icon: React.ElementType;
  onSelect: () => void;
  danger?: boolean;
}

export interface ActionMenuProps {
  label: string;
  subtitle?: string;
  actions: ActionMenuItem[];
  triggerClassName?: string;
}

const getDefaultDescription = (action: ActionMenuItem) => {
  if (action.description) return action.description;
  const lower = action.label.toLowerCase();
  if (action.danger || lower.includes('удалить')) return 'Безвозвратное удаление';
  if (lower.includes('редактировать') || lower.includes('изменить')) return 'Изменение данных и настроек';
  if (lower.includes('оплатить')) return 'Внесение оплаты';
  return undefined;
};

/** A labelled action sheet keeps secondary actions usable by touch and keyboard. */
export function ActionMenu({ label, subtitle, actions, triggerClassName }: ActionMenuProps) {
  const [open, setOpen] = useState(false);

  const hasColon = label.includes(':');
  const resolvedTitle = hasColon ? label.split(':')[0].trim() : label;
  const resolvedSubtitle = subtitle || (hasColon ? label.split(':').slice(1).join(':').trim() : 'Выберите нужное действие');

  return (
    <>
      <IconButton
        icon={MoreHorizontal}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        size="sm"
        className={cn('text-fg-subtle hover:text-fg hover:bg-surface-raised transition-colors', triggerClassName)}
      />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={resolvedTitle}
        subtitle={resolvedSubtitle}
        maxWidth="sm"
        footer={
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted hover:text-fg transition-all cursor-pointer min-h-[40px] flex items-center justify-center"
          >
            Отмена
          </button>
        }
      >
        <div className="space-y-2.5">
          {actions.map((action) => {
            const Icon = action.icon;
            const desc = getDefaultDescription(action);

            return (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  action.onSelect();
                }}
                className={cn(
                  'w-full p-3 sm:p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 group active:scale-[0.99] shadow-2xs',
                  action.danger
                    ? 'bg-surface hover:bg-danger/10 border-border/80 hover:border-danger/30 text-fg'
                    : 'bg-surface hover:bg-surface-raised border-border/80 hover:border-accent/40 text-fg'
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-transform group-hover:scale-105 shadow-2xs',
                      action.danger
                        ? 'bg-danger/10 border-danger/25 text-danger'
                        : 'bg-accent/10 border-accent/25 text-accent'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div
                      className={cn(
                        'text-xs sm:text-sm font-semibold truncate transition-colors',
                        action.danger
                          ? 'text-fg group-hover:text-danger'
                          : 'text-fg group-hover:text-accent'
                      )}
                    >
                      {action.label}
                    </div>
                    {desc && (
                      <div className="text-[11px] text-fg-subtle truncate mt-0.5 font-normal">
                        {desc}
                      </div>
                    )}
                  </div>
                </div>

                <ChevronRight
                  className={cn(
                    'w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5',
                    action.danger
                      ? 'text-fg-subtle group-hover:text-danger'
                      : 'text-fg-subtle group-hover:text-accent'
                  )}
                />
              </button>
            );
          })}
        </div>
      </Dialog>
    </>
  );
}
