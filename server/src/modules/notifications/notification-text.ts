const ROLE_NOUNS: Record<string, string> = {
  ADMIN: 'администратор',
  PARTNER: 'партнёр',
  SELLER: 'продавец',
};

export function roleNoun(role: string | null | undefined): string {
  return ROLE_NOUNS[role || ''] || 'сотрудник';
}

export function phonesWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'телефон';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'телефона';
  return 'телефонов';
}

/** «Саховат — продавец Фаридун оприходовал 15 телефонов.» */
export function receiptNotificationText(input: { storeName: string; actorName: string; actorRole: string; count: number }): string {
  return `${input.storeName} — ${roleNoun(input.actorRole)} ${input.actorName} оприходовал ${input.count} ${phonesWord(input.count)}.`;
}
