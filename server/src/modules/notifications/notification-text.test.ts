import { describe, expect, it } from 'vitest';
import { phonesWord, receiptNotificationText, roleNoun } from './notification-text';

describe('notification texts', () => {
  it('describes a store receipt the way the admin reads it', () => {
    expect(receiptNotificationText({ storeName: 'Саховат', actorName: 'Фаридун', actorRole: 'SELLER', count: 15 }))
      .toBe('Саховат — продавец Фаридун оприходовал 15 телефонов.');
    expect(receiptNotificationText({ storeName: 'ЦУМ', actorName: 'Сомон', actorRole: 'PARTNER', count: 1 }))
      .toBe('ЦУМ — партнёр Сомон оприходовал 1 телефон.');
  });

  it('uses Russian plural forms for phone counts', () => {
    expect([1, 2, 4, 5, 11, 12, 21, 22, 25, 101, 111].map(phonesWord)).toEqual([
      'телефон', 'телефона', 'телефона', 'телефонов', 'телефонов', 'телефонов', 'телефон', 'телефона', 'телефонов', 'телефон', 'телефонов',
    ]);
  });

  it('names roles in lower case', () => {
    expect(roleNoun('ADMIN')).toBe('администратор');
    expect(roleNoun('SELLER')).toBe('продавец');
    expect(roleNoun('PARTNER')).toBe('партнёр');
  });
});
