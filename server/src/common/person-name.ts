// Same pattern as src/utils/formatUser.ts: the role and store live in their own fields, so a
// name like "Рустам (Партнёр Садбарг)" is stored as "Рустам".
const ROLE_SUFFIX = /\s*\((Партн[её]р|Продавец|Администратор)[^)]*\)/gi;

/** An employee name as stored: trimmed, without role suffixes; throws when nothing is left. */
export function requirePersonName(name: unknown): string {
  const clean = typeof name === 'string' ? name.replace(ROLE_SUFFIX, '').trim() : '';
  if (!clean) throw new Error('Укажите имя сотрудника без пометки роли');
  return clean;
}
