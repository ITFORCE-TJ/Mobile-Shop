export function getPhoneColorHex(color?: string): string | null {
  if (!color) return null;
  const c = color.toLowerCase();
  if (c.includes('black') || c.includes('черн') || c.includes('темн') || c.includes('midnight') || c.includes('phantom')) return '#1e293b';
  if (c.includes('white') || c.includes('бел') || c.includes('starlight') || c.includes('pearl')) return '#f8fafc';
  if (c.includes('gold') || c.includes('золот')) return '#eab308';
  if (c.includes('silver') || c.includes('серебр')) return '#cbd5e1';
  if (c.includes('gray') || c.includes('grey') || c.includes('серый') || c.includes('титан') || c.includes('titanium') || c.includes('graphite') || c.includes('графит')) return '#64748b';
  if (c.includes('blue') || c.includes('син') || c.includes('голуб')) return '#3b82f6';
  if (c.includes('green') || c.includes('зелен') || c.includes('изумруд')) return '#22c55e';
  if (c.includes('purple') || c.includes('фиолет') || c.includes('лаванд') || c.includes('violet')) return '#a855f7';
  if (c.includes('red') || c.includes('красн')) return '#ef4444';
  if (c.includes('pink') || c.includes('розов')) return '#ec4899';
  if (c.includes('yellow') || c.includes('желт')) return '#eab308';
  if (c.includes('orange') || c.includes('оранж')) return '#f97316';
  return '#94a3b8';
}

export function formatRam(ram?: string | null): string | null {
  if (!ram) return null;
  const clean = ram.trim();
  if (!clean) return null;
  return clean.toUpperCase().includes('GB') ? clean : `${clean} GB`;
}

export function formatStorage(storage?: string | null): string {
  if (!storage) return '';
  const clean = storage.trim();
  if (!clean) return '';
  return clean.toUpperCase().includes('GB') || clean.toUpperCase().includes('TB') ? clean : `${clean} GB`;
}
