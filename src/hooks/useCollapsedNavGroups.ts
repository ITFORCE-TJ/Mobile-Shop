import { useCallback, useState } from 'react';

const STORAGE_KEY = 'nav.collapsedGroups';

function read(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Collapsed menu sections, remembered by section title. A section's index differs between
 * roles (sellers don't see the finance groups), so indexes collapsed the wrong section.
 * Shared by the drawer and the sidebar; storage failures only lose the preference.
 */
export function useCollapsedNavGroups() {
  const [collapsed, setCollapsed] = useState<string[]>(read);

  const toggle = useCallback((title: string) => {
    setCollapsed((prev) => {
      const next = prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Private mode or blocked storage: keep the in-memory state only.
      }
      return next;
    });
  }, []);

  const isCollapsed = useCallback((title: string) => collapsed.includes(title), [collapsed]);
  return { isCollapsed, toggle };
}
