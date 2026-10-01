import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';

const MONTH_NAMES_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

interface MonthPickerProps {
  /** 'YYYY-MM', same format the native <input type="month"> this replaces used. */
  value: string;
  onChange: (value: string) => void;
  onOpen?: () => void;
  className?: string;
}

/**
 * Drop-in replacement for <input type="month">. Rendered via portal to document.body
 * so it is NEVER clipped by any parent container with overflow-x: auto or overflow: hidden.
 */
export const MonthPicker: React.FC<MonthPickerProps> = ({ value, onChange, onOpen, className }) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const [valueYearStr, valueMonthStr] = value.split('-');
  const valueYear = Number(valueYearStr) || undefined;
  const valueMonth = Number(valueMonthStr) || undefined; // 1-indexed

  const [viewYear, setViewYear] = useState<number>(valueYear || new Date().getFullYear());
  useEffect(() => {
    if (open) setViewYear(valueYear || new Date().getFullYear());
  }, [open, valueYear]);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const popoverWidth = 224;
    const popoverHeight = 185;

    // Horizontally clamp within viewport
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - popoverWidth - 8);
    }
    if (left < 8) left = 8;

    // Vertically open below, or above if tight space
    let top = rect.bottom + 4;
    if (top + popoverHeight > window.innerHeight && rect.top - popoverHeight - 4 > 0) {
      top = rect.top - popoverHeight - 4;
    }

    setCoords({ top, left });
  }, []);

  const handleToggle = () => {
    if (!open) {
      updatePosition();
      onOpen?.();
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handleScrollOrResize = () => updatePosition();
    window.addEventListener('resize', handleScrollOrResize, { passive: true });
    window.addEventListener('scroll', handleScrollOrResize, { passive: true, capture: true });
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, { capture: true });
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        popoverRef.current && !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const label = valueMonth && valueYear ? `${MONTH_NAMES_RU[valueMonth - 1]} ${valueYear}` : 'Выберите месяц';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={cn('inline-flex items-center gap-1.5 cursor-pointer shrink-0 select-none', className)}
      >
        <Calendar className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
          className="fixed z-9999 w-56 rounded-xl border border-border bg-surface shadow-2xl p-2.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-border">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              aria-label="Предыдущий год"
              className="p-1 rounded-lg hover:bg-surface-raised text-fg-muted transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-fg-muted">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              aria-label="Следующий год"
              className="p-1 rounded-lg hover:bg-surface-raised text-fg-muted transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTH_NAMES_RU.map((name, idx) => {
              const isSelected = valueYear === viewYear && valueMonth === idx + 1;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    onChange(`${viewYear}-${String(idx + 1).padStart(2, '0')}`);
                    setOpen(false);
                  }}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-accent text-accent-fg font-bold shadow-xs'
                      : 'text-fg-muted hover:bg-surface-raised active:scale-95'
                  }`}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
