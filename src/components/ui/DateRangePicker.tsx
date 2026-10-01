import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, X, Check, ArrowLeftRight, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';
import { getBusinessDateKey, formatBusinessDate, formatDateRange } from '../../utils/businessDate';

const MONTH_NAMES_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const WEEKDAY_NAMES_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export interface DateRangePickerProps {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
  isToday?: boolean;
  onChange: (start: string, end: string) => void;
  onResetToday?: () => void;
  className?: string;
  defaultMode?: 'single' | 'range';
  showModeButtons?: boolean;
  placeholder?: string;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  isToday = false,
  onChange,
  onResetToday,
  className,
  defaultMode,
  showModeButtons = false,
  placeholder,
}) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const singleButtonRef = useRef<HTMLButtonElement>(null);
  const rangeButtonRef = useRef<HTMLButtonElement>(null);
  const activeAnchorRef = useRef<HTMLElement | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const todayKey = getBusinessDateKey();

  // Mode: 'single' (Точная дата) vs 'range' (Период)
  const isRangeSelected = Boolean(startDate && endDate && startDate !== endDate);
  const [mode, setMode] = useState<'single' | 'range'>(() => {
    if (defaultMode) return defaultMode;
    return isRangeSelected ? 'range' : 'single';
  });

  // Local draft states inside the popover
  const [draftStart, setDraftStart] = useState<string>(startDate || todayKey);
  const [draftEnd, setDraftEnd] = useState<string>(endDate || '');
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // Month/Year view state for the calendar
  const initialYear = Number((startDate || todayKey).slice(0, 4)) || new Date().getFullYear();
  const initialMonth = (Number((startDate || todayKey).slice(5, 7)) || (new Date().getMonth() + 1)) - 1;

  const [viewYear, setViewYear] = useState<number>(initialYear);
  const [viewMonth, setViewMonth] = useState<number>(initialMonth);

  // Synchronize draft state when popover opens or props change
  useEffect(() => {
    if (open) {
      setDraftStart(startDate || todayKey);
      setDraftEnd(endDate);
      const isRange = Boolean(startDate && endDate && startDate !== endDate);
      if (!defaultMode) {
        setMode(isRange ? 'range' : 'single');
      }
      const baseDate = startDate || todayKey;
      const y = Number(baseDate.slice(0, 4)) || new Date().getFullYear();
      const m = (Number(baseDate.slice(5, 7)) || (new Date().getMonth() + 1)) - 1;
      setViewYear(y);
      setViewMonth(m);
    }
  }, [open, startDate, endDate, todayKey, defaultMode]);

  const updatePosition = useCallback(() => {
    const anchor = activeAnchorRef.current || buttonRef.current || singleButtonRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const popoverWidth = 330;
    const popoverHeight = 440;

    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - popoverWidth - 8);
    }
    if (left < 8) left = 8;

    let top = rect.bottom + 6;
    if (top + popoverHeight > window.innerHeight && rect.top - popoverHeight - 6 > 0) {
      top = rect.top - popoverHeight - 6;
    }

    setCoords({ top, left });
  }, []);

  const handleToggle = () => {
    if (!open) {
      activeAnchorRef.current = buttonRef.current;
      updatePosition();
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const handleOpenWithMode = (m: 'single' | 'range', ref: React.RefObject<HTMLButtonElement | null>) => {
    setMode(m);
    if (m === 'single') {
      setDraftEnd('');
    }
    activeAnchorRef.current = ref.current || buttonRef.current;
    updatePosition();
    setOpen(true);
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
      if (buttonRef.current && buttonRef.current.contains(target)) return;
      if (singleButtonRef.current && singleButtonRef.current.contains(target)) return;
      if (rangeButtonRef.current && rangeButtonRef.current.contains(target)) return;
      if (popoverRef.current && !popoverRef.current.contains(target)) {
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

  // Calendar matrix calculations
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Monday = 0

  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
  const padDaysBefore: number[] = [];
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    padDaysBefore.push(prevMonthDays - i);
  }

  const currentMonthDays: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    currentMonthDays.push(d);
  }

  const nextMonthPadding = (7 - ((padDaysBefore.length + currentMonthDays.length) % 7)) % 7;
  const padDaysAfter: number[] = [];
  for (let d = 1; d <= nextMonthPadding; d++) {
    padDaysAfter.push(d);
  }

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const toDateKey = (year: number, monthIndex: number, day: number) => {
    const mm = String(monthIndex + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  };

  // Day click logic:
  // In 'single' mode (Точная дата): immediately selects that date and closes popover!
  // In 'range' mode (Период): 1st click = start date, 2nd click = end date and applies immediately!
  const handleDayClick = (dayKey: string) => {
    if (mode === 'single') {
      setDraftStart(dayKey);
      setDraftEnd(dayKey);
      onChange(dayKey, dayKey);
      setOpen(false);
      return;
    }

    // Range mode:
    if (!draftStart || (draftStart && draftEnd && draftStart !== draftEnd)) {
      setDraftStart(dayKey);
      setDraftEnd('');
    } else {
      let start = draftStart;
      let end = dayKey;
      if (start > end) {
        const tmp = start;
        start = end;
        end = tmp;
      }
      setDraftStart(start);
      setDraftEnd(end);
      onChange(start, end);
      setOpen(false);
    }
  };

  // Confirm selection manually from bottom button
  const handleApply = () => {
    if (!draftStart) return;
    if (mode === 'single') {
      onChange(draftStart, draftStart);
    } else {
      onChange(draftStart, draftEnd || draftStart);
    }
    setOpen(false);
  };

  // Preset handlers
  const handlePresetToday = () => {
    if (onResetToday) {
      onResetToday();
    } else {
      onChange(todayKey, todayKey);
    }
    setOpen(false);
  };

  const handlePresetYesterday = () => {
    const yest = new Date(Date.now() - 86400000);
    const key = getBusinessDateKey(yest);
    onChange(key, key);
    setOpen(false);
  };

  const handlePresetLast7Days = () => {
    const end = todayKey;
    const startObj = new Date(Date.now() - 6 * 86400000);
    const start = getBusinessDateKey(startObj);
    onChange(start, end);
    setOpen(false);
  };

  const handlePresetThisMonth = () => {
    const y = viewYear;
    const m = String(viewMonth + 1).padStart(2, '0');
    const start = `${y}-${m}-01`;
    const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
    const end = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    onChange(start, end);
    setOpen(false);
  };

  // Display text & states
  const hasCustomDate = !isToday && Boolean(startDate);
  const isSingleActive = hasCustomDate && (!endDate || startDate === endDate);
  const isRangeActive = hasCustomDate && Boolean(endDate && startDate !== endDate);

  let formattedDateLabel = '';
  if (hasCustomDate) {
    if (!endDate || startDate === endDate) {
      formattedDateLabel = formatBusinessDate(startDate, true);
    } else {
      formattedDateLabel = formatDateRange(startDate, endDate);
    }
  }

  // Active interval calculation for highlighting in calendar
  const activeMin = mode === 'range' && draftStart && draftEnd
    ? (draftStart < draftEnd ? draftStart : draftEnd)
    : (draftStart || '');
  const activeMax = mode === 'range' && draftStart && draftEnd
    ? (draftStart < draftEnd ? draftEnd : draftStart)
    : (mode === 'range' && draftStart && hoverDate ? (draftStart < hoverDate ? hoverDate : draftStart) : '');
  const effectiveRangeStart = mode === 'range' && activeMin && activeMax ? (activeMin < activeMax ? activeMin : activeMax) : '';
  const effectiveRangeEnd = mode === 'range' && activeMin && activeMax ? (activeMin < activeMax ? activeMax : activeMin) : '';

  return (
    <>
      {showModeButtons ? (
        /* Segmented buttons: [ 📅 Точная дата ] and [ ⇆ Период ] */
        <div className={cn('relative inline-flex items-center gap-1 bg-surface-raised p-1 rounded-xl border border-border text-xs', className)}>
          <button
            ref={singleButtonRef}
            type="button"
            onClick={() => handleOpenWithMode('single', singleButtonRef)}
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all select-none',
              isSingleActive
                ? 'bg-surface text-accent font-bold shadow-xs border border-border/80'
                : 'text-fg-muted hover:text-fg'
            )}
            title="Точная дата (один день)"
          >
            <Calendar className={cn('w-3.5 h-3.5', isSingleActive ? 'text-accent' : 'text-fg-subtle')} />
            <span className="truncate max-w-[130px]">
              {isSingleActive ? formatBusinessDate(startDate, true) : 'Точная дата'}
            </span>
          </button>

          <button
            ref={rangeButtonRef}
            type="button"
            onClick={() => handleOpenWithMode('range', rangeButtonRef)}
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all select-none',
              isRangeActive
                ? 'bg-surface text-accent font-bold shadow-xs border border-border/80'
                : 'text-fg-muted hover:text-fg'
            )}
            title="Период (диапазон дат)"
          >
            <ArrowLeftRight className={cn('w-3.5 h-3.5', isRangeActive ? 'text-accent' : 'text-fg-subtle')} />
            <span className="truncate max-w-[160px]">
              {isRangeActive ? formatDateRange(startDate, endDate) : 'Период'}
            </span>
          </button>

          {hasCustomDate && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePresetToday();
              }}
              className="p-1 rounded-md text-fg-subtle hover:text-accent hover:bg-surface transition-colors ml-0.5"
              title="Сбросить на Сегодня"
              aria-label="Сбросить фильтр дат"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        /* Unified compact trigger button */
        <div className={cn('relative inline-flex items-center', className)}>
          <button
            ref={buttonRef}
            type="button"
            onClick={handleToggle}
            className={cn(
              'h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all select-none focus:outline-none focus:ring-1 focus:ring-accent/40 shadow-xs',
              hasCustomDate
                ? 'border-accent/50 bg-accent/10 text-accent font-bold hover:bg-accent/15'
                : isToday
                  ? 'border-border/80 bg-surface text-fg font-medium hover:border-accent/40 hover:bg-surface-raised'
                  : 'border-border/80 bg-surface text-fg-muted hover:text-fg hover:border-accent/40'
            )}
            title={hasCustomDate ? `Выбран период: ${formattedDateLabel}` : 'Выбрать дату или период'}
          >
            {isRangeActive ? (
              <ArrowLeftRight className="w-3.5 h-3.5 text-accent shrink-0" />
            ) : (
              <Calendar className={cn('w-3.5 h-3.5 shrink-0', hasCustomDate ? 'text-accent' : 'text-fg-subtle')} />
            )}
            <span className="truncate max-w-[150px] sm:max-w-[220px]">
              {hasCustomDate ? formattedDateLabel : (placeholder || (isToday ? 'Сегодня' : 'Календарь'))}
            </span>
            <ChevronDown className={cn('w-3.5 h-3.5 text-fg-subtle shrink-0 transition-transform duration-200 ml-0.5', open && 'rotate-180')} />
          </button>

          {hasCustomDate && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePresetToday();
              }}
              className="ml-1 p-1.5 rounded-lg text-fg-subtle hover:text-accent hover:bg-surface-raised transition-colors"
              title="Сбросить на Сегодня"
              aria-label="Сбросить фильтр дат"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
            className="fixed z-50 w-84 bg-surface border border-border rounded-2xl shadow-2xl p-3.5 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Mode Switcher Tabs: [ Точная дата ] and [ Период ] */}
            <div className="flex items-center p-1 bg-surface-raised rounded-xl border border-border">
              <button
                type="button"
                onClick={() => {
                  setMode('single');
                  setDraftEnd('');
                }}
                className={cn(
                  'flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5',
                  mode === 'single'
                    ? 'bg-accent text-accent-contrast shadow-xs'
                    : 'text-fg-muted hover:text-fg'
                )}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Точная дата</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('range')}
                className={cn(
                  'flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5',
                  mode === 'range'
                    ? 'bg-accent text-accent-contrast shadow-xs'
                    : 'text-fg-muted hover:text-fg'
                )}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Период</span>
              </button>
            </div>

            {/* Helper mode description */}
            <div className="text-[11px] text-fg-subtle px-1">
              {mode === 'single' ? (
                <span>Нажмите на нужный день для быстрого выбора</span>
              ) : (
                <span>Выберите дату начала и дату окончания периода</span>
              )}
            </div>

            {/* Quick presets row */}
            <div className="grid grid-cols-4 gap-1 text-[11px]">
              <button
                type="button"
                onClick={handlePresetToday}
                className={cn(
                  'py-1 px-1.5 rounded-lg border text-center font-medium transition-colors',
                  isToday
                    ? 'border-accent bg-accent/20 text-accent font-bold'
                    : 'border-border/60 hover:bg-surface-raised text-fg-muted'
                )}
              >
                Сегодня
              </button>
              <button
                type="button"
                onClick={handlePresetYesterday}
                className="py-1 px-1.5 rounded-lg border border-border/60 hover:bg-surface-raised text-center text-fg-muted font-medium transition-colors"
              >
                Вчера
              </button>
              <button
                type="button"
                onClick={handlePresetLast7Days}
                className="py-1 px-1.5 rounded-lg border border-border/60 hover:bg-surface-raised text-center text-fg-muted font-medium transition-colors"
              >
                7 дней
              </button>
              <button
                type="button"
                onClick={handlePresetThisMonth}
                className="py-1 px-1.5 rounded-lg border border-border/60 hover:bg-surface-raised text-center text-fg-muted font-medium transition-colors truncate"
              >
                Этот месяц
              </button>
            </div>

            {/* Month & Year Navigator */}
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 rounded-lg hover:bg-surface-raised text-fg-muted hover:text-fg transition-colors"
                aria-label="Предыдущий месяц"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-bold text-fg">
                {MONTH_NAMES_RU[viewMonth]} {viewYear}
              </span>

              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 rounded-lg hover:bg-surface-raised text-fg-muted hover:text-fg transition-colors"
                aria-label="Следующий месяц"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="w-full">
              {/* Weekday headers */}
              <div className="grid grid-cols-7 text-center mb-1">
                {WEEKDAY_NAMES_RU.map((day) => (
                  <span key={day} className="text-[10px] font-semibold text-fg-subtle py-0.5">
                    {day}
                  </span>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-y-1 text-center" onMouseLeave={() => setHoverDate(null)}>
                {/* Padding previous month */}
                {padDaysBefore.map((d) => (
                  <div key={`prev-${d}`} className="h-7 flex items-center justify-center text-[11px] text-fg-subtle/30 pointer-events-none">
                    {d}
                  </div>
                ))}

                {/* Current month days */}
                {currentMonthDays.map((d) => {
                  const dayKey = toDateKey(viewYear, viewMonth, d);
                  const isCurrentToday = dayKey === todayKey;
                  const isStart = dayKey === draftStart;
                  const isEnd = dayKey === draftEnd;
                  const isSelectedSingle = isStart && (mode === 'single' || !draftEnd || draftStart === draftEnd);

                  const inRange =
                    mode === 'range' &&
                    effectiveRangeStart &&
                    effectiveRangeEnd &&
                    dayKey >= effectiveRangeStart &&
                    dayKey <= effectiveRangeEnd;

                  return (
                    <button
                      key={dayKey}
                      type="button"
                      onClick={() => handleDayClick(dayKey)}
                      onMouseEnter={() => mode === 'range' && draftStart && !draftEnd && setHoverDate(dayKey)}
                      className={cn(
                        'h-7 w-full text-[11px] font-medium transition-all flex items-center justify-center relative select-none',
                        // Range background
                        inRange && !isStart && !isEnd && 'bg-accent/15 text-accent font-semibold',
                        inRange && isStart && !isSelectedSingle && 'bg-accent/15 rounded-l-lg',
                        inRange && isEnd && 'bg-accent/15 rounded-r-lg',
                        // Selected endpoints
                        (isStart || isEnd) &&
                          'bg-accent text-accent-contrast font-bold rounded-lg shadow-xs z-10',
                        // Unselected standard days
                        !inRange && !isStart && !isEnd && 'text-fg hover:bg-surface-raised rounded-lg',
                        // Subtle indicator for today
                        isCurrentToday && !isStart && !isEnd && 'font-bold text-accent underline underline-offset-2'
                      )}
                    >
                      {d}
                    </button>
                  );
                })}

                {/* Padding next month */}
                {padDaysAfter.map((d) => (
                  <div key={`next-${d}`} className="h-7 flex items-center justify-center text-[11px] text-fg-subtle/30 pointer-events-none">
                    {d}
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom info & actions */}
            <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
              <div className="text-[11px] text-fg-muted truncate">
                {mode === 'single' && draftStart ? (
                  <span>
                    Дата: <strong className="text-fg">{formatBusinessDate(draftStart, false)}</strong>
                  </span>
                ) : mode === 'range' && draftStart && draftEnd && draftStart !== draftEnd ? (
                  <span>
                    Период: <strong className="text-fg">{formatDateRange(draftStart, draftEnd)}</strong>
                  </span>
                ) : draftStart ? (
                  <span>
                    С: <strong className="text-fg">{formatBusinessDate(draftStart, false)}</strong>
                  </span>
                ) : (
                  <span className="text-fg-subtle">Выберите дату</span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-surface-raised transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={!draftStart}
                  onClick={handleApply}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-accent text-accent-contrast hover:bg-accent/90 disabled:opacity-50 transition-colors flex items-center gap-1 shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Применить</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
