import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, X, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';
import { getBusinessDateKey } from '../../utils/businessDate';

const MONTH_NAMES_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const MONTH_NAMES_SHORT_RU = [
  'янв.', 'февр.', 'марта', 'апр.', 'мая', 'июня',
  'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.',
];

const WEEKDAY_NAMES_RU = ['П', 'В', 'С', 'Ч', 'П', 'С', 'В'];

export interface DateRangePickerProps {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
  isToday?: boolean;
  selectedMonth?: string; // 'YYYY-MM'
  currentMonthStr?: string; // 'YYYY-MM' default
  onChange: (start: string, end: string, monthStr?: string) => void;
  onResetToday?: () => void;
  onResetMonth?: () => void;
  className?: string;
  defaultMode?: 'single' | 'range';
  showModeButtons?: boolean;
  placeholder?: string;
  isActive?: boolean;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  isToday = false,
  selectedMonth,
  currentMonthStr,
  onChange,
  onResetToday,
  onResetMonth,
  className,
  placeholder,
  isActive,
}) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const todayKey = getBusinessDateKey();
  const fallbackThisMonthStr = currentMonthStr || todayKey.slice(0, 7);

  // Draft selection inside the modal
  const [draftStart, setDraftStart] = useState<string>(startDate || todayKey);
  const [draftEnd, setDraftEnd] = useState<string>(endDate || startDate || todayKey);

  // When modal opens, sync draft with active props
  useEffect(() => {
    if (open) {
      if (selectedMonth) {
        const [y, m] = selectedMonth.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        setDraftStart(`${selectedMonth}-01`);
        setDraftEnd(`${selectedMonth}-${String(lastDay).padStart(2, '0')}`);
      } else if (startDate) {
        setDraftStart(startDate);
        setDraftEnd(endDate || startDate);
      } else {
        const [y, m] = fallbackThisMonthStr.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        setDraftStart(`${fallbackThisMonthStr}-01`);
        setDraftEnd(`${fallbackThisMonthStr}-${String(lastDay).padStart(2, '0')}`);
      }
    }
  }, [open, startDate, endDate, selectedMonth, fallbackThisMonthStr]);

  // Scroll to selected month when modal opens
  useEffect(() => {
    if (!open) return;
    const targetMonth = (draftStart || selectedMonth || fallbackThisMonthStr).slice(0, 7);
    const timer = setTimeout(() => {
      const el = document.getElementById(`cal-month-${targetMonth}`);
      if (el) {
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [open]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Generate 15 months: from -12 months in the past to +2 months in future
  const monthsList = useMemo(() => {
    const list = [];
    const now = new Date();
    for (let offset = -12; offset <= 2; offset++) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const year = d.getFullYear();
      const monthIndex = d.getMonth();
      const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
      const name = MONTH_NAMES_RU[monthIndex];
      const daysCount = new Date(year, monthIndex + 1, 0).getDate();
      // Monday = 0, ..., Sunday = 6
      const firstDayOfWeek = (d.getDay() + 6) % 7;
      const days = Array.from({ length: daysCount }, (_, i) => i + 1);

      list.push({
        key,
        year,
        monthIndex,
        name,
        padDaysBefore: firstDayOfWeek,
        days,
        daysCount,
      });
    }
    return list;
  }, []);

  // Day click handler for single day or range selection
  const handleDayClick = useCallback((dateKey: string) => {
    // If no draft start, or a range was already selected (start !== end):
    // Start fresh with a single date
    if (!draftStart || (draftStart && draftEnd && draftStart !== draftEnd)) {
      setDraftStart(dateKey);
      setDraftEnd(dateKey);
      return;
    }

    // If currently exactly one day is selected:
    if (draftStart && (!draftEnd || draftStart === draftEnd)) {
      if (dateKey === draftStart) {
        // Tapped same day again: keep single day
        return;
      }
      // Expand into range
      const minD = dateKey < draftStart ? dateKey : draftStart;
      const maxD = dateKey < draftStart ? draftStart : dateKey;
      setDraftStart(minD);
      setDraftEnd(maxD);
    }
  }, [draftStart, draftEnd]);

  const handleSelectWholeMonth = useCallback((year: number, monthIndex: number) => {
    const mStr = String(monthIndex + 1).padStart(2, '0');
    const start = `${year}-${mStr}-01`;
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    const end = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`;
    setDraftStart(start);
    setDraftEnd(end);
  }, []);

  const handleQuickToday = useCallback(() => {
    setDraftStart(todayKey);
    setDraftEnd(todayKey);
  }, [todayKey]);

  const handleQuickThisMonth = useCallback(() => {
    const now = new Date();
    handleSelectWholeMonth(now.getFullYear(), now.getMonth());
  }, [handleSelectWholeMonth]);

  const handleApply = useCallback(() => {
    if (!draftStart) return;
    const start = draftStart;
    const end = draftEnd || draftStart;

    const [y1, m1, d1] = start.split('-').map(Number);
    const [y2, m2, d2] = end.split('-').map(Number);
    const lastDayExpected = new Date(y1, m1, 0).getDate();

    const isWholeMonth = y1 === y2 && m1 === m2 && d1 === 1 && d2 === lastDayExpected;
    const monthStr = isWholeMonth ? `${y1}-${String(m1).padStart(2, '0')}` : undefined;

    onChange(start, end, monthStr);
    setOpen(false);
  }, [draftStart, draftEnd, onChange]);

  // Formatted draft summary label for the modal header
  const draftSummary = useMemo(() => {
    if (!draftStart) return 'Нажмите на число для выбора дня или диапазона';
    const end = draftEnd || draftStart;
    const [y1, m1, d1] = draftStart.split('-').map(Number);
    const [y2, m2, d2] = end.split('-').map(Number);
    const lastDay1 = new Date(y1, m1, 0).getDate();

    if (y1 === y2 && m1 === m2 && d1 === 1 && d2 === lastDay1) {
      return `Выбран весь месяц: ${MONTH_NAMES_RU[m1 - 1]} ${y1} г.`;
    }
    if (draftStart === end) {
      return `Выбрана дата: ${d1} ${MONTH_NAMES_SHORT_RU[m1 - 1]} ${y1} г.`;
    }
    if (y1 === y2 && m1 === m2) {
      return `Период: ${d1} — ${d2} ${MONTH_NAMES_SHORT_RU[m1 - 1]} ${y1} г.`;
    }
    return `Период: ${d1} ${MONTH_NAMES_SHORT_RU[m1 - 1]} ${y1} — ${d2} ${MONTH_NAMES_SHORT_RU[m2 - 1]} ${y2} г.`;
  }, [draftStart, draftEnd]);

  // Label displayed on the main trigger button in the search bar
  const displayLabel = useMemo(() => {
    if (isToday) {
      return 'Сегодня';
    }

    if (selectedMonth) {
      const [y, m] = selectedMonth.split('-').map(Number);
      if (y && m) {
        return `${MONTH_NAMES_RU[m - 1]} ${y}`;
      }
    }

    if (startDate) {
      const end = endDate || startDate;
      const [y1, m1, d1] = startDate.split('-').map(Number);
      const [y2, m2, d2] = end.split('-').map(Number);
      const lastDayExpected = new Date(y1, m1, 0).getDate();

      // Check if it's a full calendar month
      if (y1 === y2 && m1 === m2 && d1 === 1 && d2 === lastDayExpected) {
        return `${MONTH_NAMES_RU[m1 - 1]} ${y1}`;
      }
      if (startDate === end) {
        return `${d1} ${MONTH_NAMES_SHORT_RU[m1 - 1]} ${y1}`;
      }
      if (y1 === y2 && m1 === m2) {
        return `${d1} — ${d2} ${MONTH_NAMES_SHORT_RU[m1 - 1]}`;
      }
      return `${d1}.${String(m1).padStart(2, '0')} — ${d2}.${String(m2).padStart(2, '0')}`;
    }

    if (placeholder) return placeholder;

    // Default: current month
    const [y, m] = fallbackThisMonthStr.split('-').map(Number);
    return `${MONTH_NAMES_RU[(m || 1) - 1]} ${y || new Date().getFullYear()}`;
  }, [isToday, selectedMonth, startDate, endDate, placeholder, fallbackThisMonthStr]);

  const hasCustomFilter = Boolean(startDate && (startDate !== `${fallbackThisMonthStr}-01` || (endDate && endDate !== `${fallbackThisMonthStr}-${new Date(Number(fallbackThisMonthStr.slice(0, 4)), Number(fallbackThisMonthStr.slice(5, 7)), 0).getDate()}`))) || Boolean(selectedMonth && selectedMonth !== fallbackThisMonthStr);

  const isButtonHighlighted = isActive ?? (Boolean(selectedMonth) || Boolean(startDate) || !isToday);

  return (
    <>
      <div className={cn('relative inline-flex items-center shrink-0', className)}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all select-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent/40 shadow-xs',
            isButtonHighlighted
              ? 'border-accent/50 bg-accent/10 text-accent font-bold hover:bg-accent/15'
              : 'border-border/80 bg-surface text-fg-muted hover:text-fg hover:border-accent/40'
          )}
          title={`Выбран период: ${displayLabel}`}
        >
          <Calendar className={cn('w-3.5 h-3.5 shrink-0', isButtonHighlighted ? 'text-accent' : 'text-fg-subtle')} />
          <span className="truncate max-w-[160px] sm:max-w-[220px]">
            {displayLabel}
          </span>
          <ChevronDown className={cn('w-3.5 h-3.5 text-fg-subtle shrink-0 transition-transform duration-200 ml-0.5', open && 'rotate-180')} />
        </button>

        {hasCustomFilter && onResetMonth && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onResetMonth();
            }}
            className="ml-1 p-1.5 rounded-lg text-fg-subtle hover:text-accent hover:bg-surface-raised transition-colors cursor-pointer"
            title="Сбросить на текущий месяц"
            aria-label="Сбросить фильтр дат"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full h-full sm:h-[88vh] sm:max-h-[760px] sm:max-w-md sm:rounded-3xl bg-surface flex flex-col overflow-hidden shadow-2xl border border-border animate-in zoom-in-95 duration-150">
            {/* Top Header matching user screenshot */}
            <div className="px-4 pt-4 pb-3 shrink-0 border-b border-border/40 bg-surface">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-2 -ml-2 text-fg hover:bg-surface-raised rounded-full transition-colors cursor-pointer"
                  aria-label="Закрыть"
                >
                  <X className="w-6 h-6" />
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleQuickToday}
                    className="text-xs px-2.5 py-1 rounded-lg border border-border bg-surface-raised hover:bg-surface text-fg font-medium transition-colors cursor-pointer"
                  >
                    Сегодня
                  </button>
                  <button
                    type="button"
                    onClick={handleQuickThisMonth}
                    className="text-xs px-2.5 py-1 rounded-lg border border-border bg-surface-raised hover:bg-surface text-fg font-medium transition-colors cursor-pointer"
                  >
                    Этот месяц
                  </button>
                </div>
              </div>
              <h2 className="text-xl font-bold text-fg mt-2 tracking-tight">Выберите дату</h2>
              <p className="text-xs text-accent font-semibold mt-0.5 truncate">
                {draftSummary}
              </p>
            </div>

            {/* Pinned weekday headers matching user photo (П В С Ч П С В) */}
            <div className="grid grid-cols-7 text-center py-2.5 px-4 border-b border-border/40 text-xs font-semibold text-fg-subtle shrink-0 bg-surface select-none">
              {WEEKDAY_NAMES_RU.map((day, idx) => (
                <span key={`${day}-${idx}`}>{day}</span>
              ))}
            </div>

            {/* Scrollable Month List */}
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-6 overscroll-contain"
            >
              {monthsList.map((m) => {
                return (
                  <div key={m.key} id={`cal-month-${m.key}`} className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-sm font-bold text-fg">
                        {m.name} {m.year} г.
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSelectWholeMonth(m.year, m.monthIndex)}
                        className="text-xs text-accent hover:underline font-semibold cursor-pointer"
                      >
                        Весь месяц
                      </button>
                    </div>

                    {/* Days grid matching Image 2 */}
                    <div className="grid grid-cols-7 text-center gap-y-1 select-none">
                      {/* Empty padding cells before month day 1 */}
                      {Array.from({ length: m.padDaysBefore }).map((_, i) => (
                        <div key={`pad-${i}`} className="h-10 pointer-events-none" />
                      ))}

                      {/* Day cells */}
                      {m.days.map((dayNum) => {
                        const dateKey = `${m.year}-${String(m.monthIndex + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                        const isStart = dateKey === draftStart;
                        const isEnd = dateKey === draftEnd;
                        const isSingle = isStart && (!draftEnd || draftStart === draftEnd);
                        const inRange = Boolean(draftStart && draftEnd && dateKey >= draftStart && dateKey <= draftEnd);
                        const isTodayDate = dateKey === todayKey;

                        return (
                          <div
                            key={dateKey}
                            className={cn(
                              'h-10 relative flex items-center justify-center',
                              inRange && !isSingle && 'bg-accent/15',
                              inRange && isStart && !isSingle && 'rounded-l-full',
                              inRange && isEnd && !isSingle && 'rounded-r-full'
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => handleDayClick(dateKey)}
                              className={cn(
                                'w-9 h-9 flex items-center justify-center text-sm font-medium transition-all cursor-pointer relative z-10',
                                // Single selected date (clean circular ring outline like user photo)
                                isSingle && 'rounded-full border-2 border-emerald-600 dark:border-emerald-500 bg-emerald-500/10 text-fg font-bold shadow-xs',
                                // Range endpoints (solid accent)
                                (isStart || isEnd) && !isSingle && 'rounded-full bg-accent text-white font-bold shadow-xs',
                                // Range inner days
                                inRange && !isStart && !isEnd && 'text-accent font-semibold',
                                // Unselected days
                                !inRange && !isSingle && 'rounded-full text-fg hover:bg-surface-raised active:scale-95',
                                // Today marker
                                isTodayDate && !inRange && !isSingle && 'text-accent font-bold underline underline-offset-4'
                              )}
                            >
                              {dayNum}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Bar: Full-width green "Подтвердить" button matching photo */}
            <div className="p-4 border-t border-border bg-surface shrink-0">
              <button
                type="button"
                onClick={handleApply}
                disabled={!draftStart}
                className="w-full h-12 rounded-2xl bg-[#00a862] hover:bg-[#009657] active:scale-[0.98] text-white text-base font-bold transition-all shadow-md flex items-center justify-center cursor-pointer disabled:opacity-50"
              >
                Подтвердить
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
