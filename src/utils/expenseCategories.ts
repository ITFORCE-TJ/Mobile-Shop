// Single source of truth for expense categories — shared by the Expenses page (filters,
// create/edit forms) and the per-store finance report (expenses by category).
export const STANDARD_EXPENSE_CATEGORIES = [
  { id: 'RENT', label: 'Аренда помещения' },
  { id: 'SALARY', label: 'Зарплата сотрудников' },
  { id: 'EMPLOYEE_ADVANCE', label: 'Аванс / Подотчет сотрудника' },
  { id: 'UTILITIES', label: 'Коммуналка и интернет' },
  { id: 'MARKETING', label: 'Реклама и маркетинг' },
  { id: 'REPAIR_PARTS', label: 'Запчасти для ремонта' },
  { id: 'TAXES', label: 'Налоги и сборы' },
  { id: 'SUPPLIES', label: 'Расходные материалы' },
  { id: 'OTHER', label: 'Прочие расходы' },
];

export const LEGACY_EXPENSE_LABELS: Record<string, string> = {
  'Аренда': 'Аренда помещения',
  'Зарплата': 'Зарплата сотрудников',
  'Аванс сотрудника': 'Аванс / Подотчет сотрудника',
  'Коммунальные': 'Коммуналка и интернет',
  'Ремонт': 'Ремонт и запчасти',
  'Транспорт': 'Транспорт и доставка',
  'Реклама': 'Реклама и маркетинг',
  'Хозяйственные': 'Хозяйственные товары',
  'Другие': 'Прочие расходы',
};

/** Custom categories are stored by their readable name, so an unknown key is shown as-is. */
export function expenseCategoryLabel(key: string): string {
  return STANDARD_EXPENSE_CATEGORIES.find((c) => c.id === key)?.label || LEGACY_EXPENSE_LABELS[key] || key || 'Прочие расходы';
}

/** Translates any bracketed category codes like [UTILITIES] or [RENT] to user-facing Russian names. */
export function translateExpenseText(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/\[([A-Za-z0-9_]+)\]/g, (match, code) => {
    const label = expenseCategoryLabel(code);
    return label !== code ? `[${label}]` : match;
  });
}
