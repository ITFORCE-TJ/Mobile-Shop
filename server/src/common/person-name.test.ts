import { describe, expect, it } from 'vitest';
import { requirePersonName } from './person-name';

describe('requirePersonName', () => {
  it('stores names without role suffixes', () => {
    expect(requirePersonName('  Рустам (Партнёр Садбарг) ')).toBe('Рустам');
    expect(requirePersonName('Алишер (продавец ЦУМ)')).toBe('Алишер');
    expect(requirePersonName('Далер')).toBe('Далер');
  });

  it('keeps other brackets', () => {
    expect(requirePersonName('Сомон (старший)')).toBe('Сомон (старший)');
  });

  it('rejects empty names and names that are only a suffix', () => {
    expect(() => requirePersonName('   ')).toThrow('Укажите имя');
    expect(() => requirePersonName('(Партнер ЦУМ)')).toThrow('Укажите имя');
    expect(() => requirePersonName(undefined)).toThrow('Укажите имя');
  });
});
