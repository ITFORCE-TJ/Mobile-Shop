export const formatDateStr = (dateVal?: string): string => {
  if (!dateVal) return '-';
  const clean = dateVal.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return clean;
};
