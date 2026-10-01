/**
 * Utility to format and sanitize user display names.
 * Strips explicit role suffixes like "(Партнёр ЦУМ)", "(Продавец Садбарг)", etc.
 */
export function formatUserName(name?: string | null): string {
  if (!name) return 'Пользователь';
  return name.replace(/\s*\((Партн[её]р|Продавец|Администратор)[^)]*\)/gi, '').trim();
}
