import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Calendar, X, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { ModalLayer } from './ModalLayer';
import { currentBusinessMonth, getBusinessDateKey, monthBounds, wholeMonthOf } from '../../utils/businessDate';

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
  onResetMonth?: () => void;
  /** Offer «Всё время»; the page decides what it means (no date filter). */
  onSelectAllTime?: () => void;
  isAllTime?: boolean;
  className?: string;
  placeholder?: string;
  isActive?: boolean;
}

type MonthView = { key: string; year: number; monthIndex: number; name: string; padDaysBefore: number; days: number[] };

/** The 12 months of one year (up to the current business month for the current year). */
function monthsOfYear(year: number, currentMonth: string): MonthView[] {
  const list: MonthView[] = [];
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    if (key > currentMonth) break;
    const daysCount = Number(monthBounds(key).end.slice(8, 10));
    // Monday = 0, ..., Sunday = 6 (calendar weekday, independent of any time zone)
    const firstDayOfWeek = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7;
    list.push({
      key,
      year,
      monthIndex,
      name: MONTH_NAMES_RU[monthIndex],
      padDaysBefore: firstDayOfWeek,
      days: Array.from({ length: daysCount }, (_, i) => i + 1),
    });
  }
  return list;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  isToday = false,
  selectedMonth,
  currentMonthStr,
  onChange,
  onResetMonth,
  onSelectAllTime,
  isAllTime = false,
  className,
  placeholder,
  isActive,
}) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Everything date-related follows the business time zone, like the server.
  const todayKey = getBusinessDateKey();
  const thisMonth = currentBusinessMonth();
  const fallbackThisMonthStr = currentMonthStr || thisMonth;

  // The month the active filter points at — what the picker opens on.
  const activeMonth = (selectedMonth || (startDate ? startDate.slice(0, 7) : '') || fallbackThisMonthStr);

  // Draft selection inside the modal
  const [draftStart, setDraftStart] = useState<string>(startDate || todayKey);
  const [draftEnd, setDraftEnd] = useState<string>(endDate || startDate || todayKey);
  const [viewYear, setViewYear] = useState<number>(Number(activeMonth.slice(0, 4)));
  // Month to bring into view once its year is rendered (set on open and by quick actions).
  const pendingScrollMonth = useRef<string | null>(null);

  // When modal opens, sync draft and the shown year with the active filter.
  useEffect(() => {
    if (!open) return;
    if (selectedMonth) {
      const { start, end } = monthBounds(selectedMonth);
      setDraftStart(start);
      setDraftEnd(end);
    } else if (startDate) {
      setDraftStart(startDate);
      setDraftEnd(endDate || startDate);
    } else {
      const { start, end } = monthBounds(fallbackThisMonthStr);
      setDraftStart(start);
      setDraftEnd(end);
    }
    setViewYear(Number(activeMonth.slice(0, 4)));
    pendingScrollMonth.current = activeMonth;
  }, [open, startDate, endDate, selectedMonth, fallbackThisMonthStr, activeMonth]);

  // Scroll to the pending month after the year containing it has rendered. It is computed from
  // the active filter (not a draft left over from a previous opening), so it never goes stale.
  useEffect(() => {
    if (!open || !pendingScrollMonth.current) return;
    const targetMonth = pendingScrollMonth.current;
    const timer = setTimeout(() => {
      document.getElementById(`cal-month-${targetMonth}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      pendingScrollMonth.current = null;
    }, 60);
    return () => clearTimeout(timer);
  }, [open, viewYear]);

  // Any past year is reachable; future months are never offered.
  const currentYear = Number(thisMonth.slice(0, 4));
  const monthsList = useMemo(() => monthsOfYear(viewYear, thisMonth), [viewYear, thisMonth]);

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

  const handleSelectWholeMonth = useCallback((month: string) => {
    const { start, end } = monthBounds(month);
    setDraftStart(start);
    setDraftEnd(end);
  }, []);

  const jumpToMonth = useCallback((month: string) => {
    pendingScrollMonth.current = month;
    setViewYear(Number(month.slice(0, 4)));
  }, []);

  const handleQuickToday = useCallback(() => {
    setDraftStart(todayKey);
    setDraftEnd(todayKey);
    jumpToMonth(thisMonth);
  }, [todayKey, thisMonth, jumpToMonth]);

  const handleQuickThisMonth = useCallback(() => {
    handleSelectWholeMonth(thisMonth);
    jumpToMonth(thisMonth);
  }, [handleSelectWholeMonth, jumpToMonth, thisMonth]);

  const handleApply = useCallback(() => {
    if (!draftStart) return;
    const start = draftStart;
    const end = draftEnd || draftStart;
    onChange(start, end, wholeMonthOf(start, end));
    setOpen(false);
  }, [draftStart, draftEnd, onChange]);

  // Formatted draft summary label for the modal header
  const draftSummary = useMemo(() => {
    if (!draftStart) return 'Нажмите на число для выбора дня или диапазона';
    const end = draftEnd || draftStart;
    const [y1, m1, d1] = draftStart.split('-').map(Number);
    const [y2, m2, d2] = end.split('-').map(Number);

    if (wholeMonthOf(draftStart, end)) {
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
    if (isAllTime) return 'Всё время';
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

      if (wholeMonthOf(startDate, end)) {
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
    return `${MONTH_NAMES_RU[(m || 1) - 1]} ${y}`;
  }, [isAllTime, isToday, selectedMonth, startDate, endDate, placeholder, fallbackThisMonthStr]);

  const currentBounds = monthBounds(fallbackThisMonthStr);
  const hasCustomFilter = isAllTime
    || Boolean(startDate && (startDate !== currentBounds.start || (endDate && endDate !== currentBounds.end)))
    || Boolean(selectedMonth && selectedMonth !== fallbackThisMonthStr);

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
          <span className="truncate max-w-40 sm:max-w-55">
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

      {open && (
        // The shared layer traps focus, closes on Esc, blocks the page behind and returns focus
        // to the period button. The safe-area padding keeps the close button below the iPhone
        // notch and «Подтвердить» above the home indicator.
        <ModalLayer variant="fullscreen" label="Выбор периода" onClose={() => setOpen(false)}>
        <div
          className="relative w-full h-full flex items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          style={{ paddingTop: 'var(--sa-top)', paddingBottom: 'var(--sa-bottom)' }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" aria-hidden="true" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="Выбор периода" className="relative w-full h-full sm:h-[88vh] sm:max-h-190 sm:max-w-md sm:rounded-3xl bg-surface flex flex-col overflow-hidden shadow-2xl border border-border animate-in zoom-in-95 duration-150">
            {/* Top Header matching user screenshot */}
            <div className="px-4 pt-4 pb-3 shrink-0 border-b border-border/40 bg-surface">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-11 h-11 -ml-2 flex items-center justify-center text-fg hover:bg-surface-raised rounded-full transition-colors cursor-pointer"
                  aria-label="Закрыть"
                >
                  <X className="w-6 h-6" />
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleQuickToday}
                    className="h-9 text-xs px-2.5 rounded-lg border border-border bg-surface-raised hover:bg-surface text-fg font-medium transition-colors cursor-pointer"
                  >
                    Сегодня
                  </button>
                  <button
                    type="button"
                    onClick={handleQuickThisMonth}
                    className="h-9 text-xs px-2.5 rounded-lg border border-border bg-surface-raised hover:bg-surface text-fg font-medium transition-colors cursor-pointer"
                  >
                    Этот месяц
                  </button>
                  {onSelectAllTime && (
                    <button
                      type="button"
                      onClick={() => { onSelectAllTime(); setOpen(false); }}
                      className="h-9 text-xs px-2.5 rounded-lg border border-border bg-surface-raised hover:bg-surface text-fg font-medium transition-colors cursor-pointer"
                    >
                      Всё время
                    </button>
                  )}
                </div>
              </div>
              <h2 className="text-xl font-bold text-fg mt-2 tracking-tight">Выберите дату</h2>
              <p className="text-xs text-accent font-semibold mt-0.5 truncate">
                {draftSummary}
              </p>
            </div>

            {/* Year switcher: any past year can be opened; the future is not offered */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 shrink-0">
              <button
                type="button"
                onClick={() => setViewYear((y) => y - 1)}
                aria-label="Предыдущий год"
                className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-surface-raised text-fg-muted cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-bold text-fg">{viewYear}</span>
              <button
                type="button"
                onClick={() => setViewYear((y) => Math.min(currentYear, y + 1))}
                disabled={viewYear >= currentYear}
                aria-label="Следующий год"
                className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-surface-raised text-fg-muted cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
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
                        onClick={() => handleSelectWholeMonth(m.key)}
                        className="min-h-9 px-1 text-xs text-accent hover:underline font-semibold cursor-pointer"
                      >
                        Весь месяц
                      </button>
                    </div>

                    {/* Days grid matching Image 2 */}
                    <div className="grid grid-cols-7 text-center gap-y-1 select-none">
                      {/* Empty padding cells before month day 1 */}
                      {Array.from({ length: m.padDaysBefore }).map((_, i) => (
                        <div key={`pad-${i}`} className="h-11 pointer-events-none" />
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
                              'h-11 relative flex items-center justify-center',
                              inRange && !isSingle && 'bg-accent/15',
                              inRange && isStart && !isSingle && 'rounded-l-full',
                              inRange && isEnd && !isSingle && 'rounded-r-full'
                            )}
                          >
                            <button
                              type="button"
                              aria-label={`${dayNum} ${MONTH_NAMES_SHORT_RU[m.monthIndex]} ${m.year}`}
                              aria-pressed={inRange || isSingle}
                              disabled={dateKey > todayKey}
                              onClick={() => handleDayClick(dateKey)}
                              className={cn(
                                'w-11 h-11 flex items-center justify-center text-sm font-medium transition-all cursor-pointer relative z-10 disabled:opacity-30 disabled:cursor-not-allowed',
                                // Single selected date (clean circular ring outline like user photo)
                                isSingle && 'rounded-full border-2 border-accent bg-accent/10 text-fg font-bold shadow-xs',
                                // Range endpoints (solid accent)
                                (isStart || isEnd) && !isSingle && 'rounded-full bg-accent text-accent-fg font-bold shadow-xs',
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
                className="w-full h-12 rounded-2xl bg-accent hover:bg-accent-strong active:scale-[0.98] text-accent-fg text-base font-bold transition-all shadow-md flex items-center justify-center cursor-pointer disabled:opacity-50"
              >
                Подтвердить
              </button>
            </div>
          </div>
        </div>
        </ModalLayer>
      )}
    </>
  );
};
