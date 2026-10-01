/**
 * Utility to format and sanitize user display names.
 * Strips explicit role suffixes like "(Партнёр ЦУМ)", "(Продавец Садбарг)", etc.
 */
const ROLE_SUFFIX = /\s*\((Партн[её]р|Продавец|Администратор)[^)]*\)/gi;

/** The name without role suffixes; may be empty when the name was only a suffix. */
export function stripRoleSuffix(name?: string | null): string {
  return (name || '').replace(ROLE_SUFFIX, '').trim();
}

/** Display name without role suffixes, or the caller's fallback when nothing is left. */
export function formatUserName(name?: string | null, fallback = 'Пользователь'): string {
  return stripRoleSuffix(name) || fallback;
}
