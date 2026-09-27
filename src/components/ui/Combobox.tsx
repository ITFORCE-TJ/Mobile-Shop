import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../utils/cn';

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  required?: boolean;
  autoFocus?: boolean;
}

/**
 * Free-text input with a tap-to-see-everything suggestion list — a drop-in replacement for
 * <input list="..."> + <datalist>. The native datalist popup on most mobile browsers (iOS
 * Safari in particular) only appears once the user starts typing, if it appears at all —
 * so on a touch device "known models show up for quick pick" silently never happens.
 * This opens the full option list immediately on focus/tap, narrows it as you type, and
 * still accepts free text for a genuinely new brand/model the list doesn't have yet.
 */
export const Combobox: React.FC<ComboboxProps> = ({ value, onChange, options, placeholder, className, required, autoFocus }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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

  const query = value.trim().toLowerCase();
  const filtered = query ? options.filter((o) => o.toLowerCase().includes(query)) : options;

  return (
    <div className="app-combobox relative" ref={containerRef}>
      <input
        type="text"
        required={required}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={cn('w-full', className)}
        autoComplete="off"
      />

      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg py-1">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              // Selecting via mousedown (before the input's blur/click-outside fires) so the
              // click isn't swallowed by the dropdown closing out from under it first.
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-raised hover:text-accent transition-colors truncate"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
