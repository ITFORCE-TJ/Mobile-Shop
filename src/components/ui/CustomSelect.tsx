import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface CustomSelectOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
  sublabel?: string;
}

interface CustomSelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: CustomSelectOption<T>[];
  placeholder?: string;
  title?: string;
  icon?: React.ReactNode;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

/**
 * Modern, theme-aware custom select dropdown & mobile bottom-sheet picker.
 * Replaces native HTML <select> elements that open jarring white OS dialogs on Android.
 */
export function CustomSelect<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = 'Выбрать...',
  title,
  icon,
  className,
  triggerClassName,
  disabled = false,
}: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (val: T) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={cn(
          'flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-surface-raised border border-border text-fg text-xs font-semibold hover:border-accent/50 active:bg-surface transition-all cursor-pointer select-none text-left min-h-[34px]',
          isOpen && 'border-accent ring-1 ring-accent/30',
          disabled && 'opacity-50 cursor-not-allowed',
          triggerClassName
        )}
      >
        <div className="flex items-center gap-2 min-w-0 truncate">
          {icon && <span className="text-accent shrink-0">{icon}</span>}
          {selectedOption?.icon && !icon && (
            <span className="text-accent shrink-0">{selectedOption.icon}</span>
          )}
          <span className="truncate">{selectedOption?.label || placeholder}</span>
        </div>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-fg-subtle transition-transform duration-200 shrink-0',
            isOpen && 'rotate-180 text-accent'
          )}
        />
      </button>

      {/* Desktop Floating Dropdown Menu */}
      {isOpen && (
        <div className="hidden sm:block absolute z-50 top-full left-0 mt-1 min-w-[200px] w-full max-w-xs rounded-xl bg-surface border border-border shadow-xl p-1 space-y-0.5 animate-in fade-in-50 zoom-in-95 duration-150">
          <div className="max-h-60 overflow-y-auto space-y-0.5">
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    'w-full px-2.5 py-2 rounded-lg text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer',
                    isSelected
                      ? 'bg-accent/15 text-accent font-bold'
                      : 'hover:bg-surface-raised text-fg'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {opt.icon && (
                      <span className={cn('shrink-0', isSelected ? 'text-accent' : 'text-fg-subtle')}>
                        {opt.icon}
                      </span>
                    )}
                    <div className="min-w-0">
                      <span className="truncate block">{opt.label}</span>
                      {opt.sublabel && (
                        <span className="text-[10px] text-fg-subtle font-normal block truncate">
                          {opt.sublabel}
                        </span>
                      )}
                    </div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile Bottom Sheet Modal */}
      {isOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />

          {/* Bottom Sheet Drawer */}
          <div className="relative bg-surface border-t border-border rounded-t-2xl p-4 shadow-2xl max-h-[80vh] flex flex-col space-y-3 z-10 animate-in slide-in-from-bottom duration-200">
            {/* Grab Handle */}
            <div className="w-10 h-1 bg-border rounded-full mx-auto shrink-0 mb-1" />

            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-sm font-bold text-fg flex items-center gap-2">
                {icon && <span className="text-accent">{icon}</span>}
                {title || placeholder || 'Выберите вариант'}
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-raised cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Options List */}
            <div className="overflow-y-auto space-y-1.5 py-1 max-h-[55vh]">
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      'w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-left flex items-center justify-between gap-3 transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-accent/15 border border-accent/35 text-accent font-bold shadow-xs'
                        : 'bg-surface-raised/60 hover:bg-surface-raised text-fg border border-border/50'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {opt.icon && (
                        <span
                          className={cn(
                            'shrink-0 p-1.5 rounded-lg border',
                            isSelected
                              ? 'bg-accent/20 border-accent/40 text-accent'
                              : 'bg-surface border-border text-fg-subtle'
                          )}
                        >
                          {opt.icon}
                        </span>
                      )}
                      <div className="min-w-0">
                        <span className="text-sm font-semibold block truncate">{opt.label}</span>
                        {opt.sublabel && (
                          <span className="text-[11px] text-fg-subtle font-normal block truncate mt-0.5">
                            {opt.sublabel}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className="w-5 h-5 text-accent shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
