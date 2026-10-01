import { describe, expect, it } from 'vitest';
import { formatUserName, stripRoleSuffix } from './formatUser';

describe('formatUserName', () => {
  it('drops role suffixes from display names', () => {
    expect(formatUserName('Рустам (Партнёр Садбарг)')).toBe('Рустам');
    expect(formatUserName('Алишер (Продавец Садбарг)')).toBe('Алишер');
    expect(formatUserName('Далер')).toBe('Далер');
  });

  it('uses the caller\'s fallback for an empty name or a name that is only a role suffix', () => {
    expect(formatUserName('', 'Администратор')).toBe('Администратор');
    expect(formatUserName(undefined, 'Партнёр')).toBe('Партнёр');
    expect(formatUserName('(Партнёр ЦУМ)', 'Партнёр')).toBe('Партнёр');
    expect(formatUserName(null)).toBe('Пользователь');
  });

  it('stripRoleSuffix leaves an empty string instead of inventing a name', () => {
    expect(stripRoleSuffix('(Продавец ЦУМ)')).toBe('');
    expect(stripRoleSuffix('Сомон (Партнер ЦУМ)')).toBe('Сомон');
  });
});
