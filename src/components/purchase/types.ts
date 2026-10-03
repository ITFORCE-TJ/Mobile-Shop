export interface PurchaseItem {
  imei: string;
}

export interface PurchaseItemGroup {
  id: string;
  brand: string;
  model: string;
  ram: string;
  storage: string;
  color: string;
  purchasePriceUsd: number;
  isBonus?: boolean;
  bonusCampaign?: string;
  items: PurchaseItem[];
}

export interface PurchasePreviewGroup {
  brand: string;
  model: string;
  ram: string;
  storage: string;
  color: string;
  purchasePriceUsd: number;
  isBonus?: boolean;
  bonusCampaign?: string;
  items: PurchaseItem[];
  imeis: string[];
}

export interface PurchasePreviewData {
  supplierId: string;
  invoiceNumber: string;
  date: string;
  isStorePurchase: boolean;
  storeId?: string;
  groups: PurchasePreviewGroup[];
}

export const formatInvoiceDate = (dateVal?: string): string => {
  if (!dateVal) return '-';
  try {
    const clean = dateVal.split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return clean;
  } catch {
    return dateVal;
  }
};

export const getImeiPair = (value: string): [string, string] => {
  const [imei1 = '', imei2 = ''] = (value || '').split(/[\/,]/).map(part => part.trim());
  return [imei1, imei2];
};
