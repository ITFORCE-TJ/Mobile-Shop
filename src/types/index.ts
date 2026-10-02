export type Role = 'ADMIN' | 'PARTNER' | 'SELLER';

export type DeviceStatus = 
  | 'MAIN_WAREHOUSE'
  | 'STORE_STOCK'
  | 'SOLD'
  | 'IN_STOCK_AFTER_EXCHANGE'
  | 'IN_REPAIR'
  | 'TRANSFER_PENDING';

export type RepairStatus = 
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'READY'
  | 'ISSUED'
  | 'DIAGNOSTICS'
  | 'IN_REPAIR'
  | 'DELIVERED'
  | 'UNREPAIRABLE';

export type TransferStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export type PaymentMethod = 'CASH' | 'CARD' | 'SPLIT' | 'DEBT';

export type ExpenseCategory = 
  | 'RENT'
  | 'SALARY'
  | 'EMPLOYEE_ADVANCE'
  | 'UTILITIES'
  | 'MARKETING'
  | 'TAXES'
  | 'SUPPLIES'
  | 'REPAIR_PARTS'
  | 'OTHER'
  | 'Аренда'
  | 'Зарплата'
  | 'Аванс сотрудника'
  | 'Коммунальные'
  | 'Ремонт'
  | 'Транспорт'
  | 'Доставка'
  | 'Реклама'
  | 'Хозяйственные'
  | 'Другие'
  | (string & {});

export type PageId =
  | 'SALE'
  | 'SALES_HISTORY'
  | 'INVENTORY'
  | 'PURCHASE'
  | 'TRANSFER'
  | 'EXCHANGE'
  | 'REPAIR'
  | 'SUPPLIERS'
  | 'BONUSES'
  | 'EXPENSES'
  | 'OWNERS'
  | 'EMPLOYEES'
  | 'REPORTS'
  | 'FINANCE'
  | 'AUDIT_LOG'
  | 'SETTINGS'
  | 'NOTIFICATIONS'
  | 'RECEIPTS';

export interface User {
  id: string;
  name: string;
  login: string;
  passwordHash?: string;
  pin?: string;
  role: Role;
  storeId?: string; // If SELLER, assigned store
  storeName?: string;
  active: boolean;
  isActive?: boolean;
  createdAt: string;
  baseSalaryTjs?: number;
  salesCommissionPercent?: number;
}

export interface Store {
  id: string;
  name: string;
  address?: string;
  isMainWarehouse?: boolean;
  /** Registers are kept in USD (TJS takings converted at the day's rate). */
  cashBalanceUsd: number;
  active: boolean;
}

export interface DeviceTimelineEvent {
  id: string;
  date: string;
  type: string;
  description: string;
  user: string;
  storeName?: string;
  priceTjs?: number;
  priceUsd?: number;
}

export interface Device {
  id: string;
  imei: string;
  imei2?: string;
  brand: string;
  model: string;
  ram?: string;
  storage: string;
  color: string;
  status: DeviceStatus;
  locationId: string; // Store id or 'main_warehouse'
  locationName: string;
  supplierId?: string;
  supplierName?: string;
  invoiceNumber?: string;
  purchaseInvoiceId?: string;
  retailPriceTjs?: number;
  receivedDate?: string;
  purchaseCostUsd: number;
  costBasisUsd: number; // Cost basis for calculating profit (could be exchange-in value or $0 for bonus)
  isBonus?: boolean;
  bonusCampaign?: string;
  createdAt: string;
  timeline: DeviceTimelineEvent[];
}

export interface SaleItem {
  deviceId: string;
  imei: string;
  imei2?: string;
  brand: string;
  model: string;
  ram?: string;
  storage: string;
  color: string;
  salePriceTjs: number;
  salePriceUsd: number;
  purchaseCostUsd: number;
  costBasisUsd: number;
  isBelowCost?: boolean;
}

export interface ExchangeEvent {
  id: string;
  date: string;
  returnedDeviceId: string;
  returnedImei: string;
  returnedModel: string;
  exchangeInValueTjs: number;
  exchangeInValueUsd: number;
  replacementDeviceId: string;
  replacementImei: string;
  replacementModel: string;
  newPriceTjs: number;
  newPriceUsd: number;
  differenceTjs: number; // positive = customer paid, negative = store gave back
  paymentMethod?: PaymentMethod;
  cashAmountTjs?: number;
  cardAmountTjs?: number;
  exchangeRate: number;
  processedBy: string;
}

export interface Sale {
  id: string;
  receiptNumber: number;
  date: string;
  storeId: string;
  storeName: string;
  sellerId: string;
  sellerName: string;
  customerName?: string;
  customerId?: string;
  items: SaleItem[];
  totalTjs: number;
  totalUsd: number;
  recognizedProfitUsd?: number;
  exchangeRate?: number;
  paymentMethod: PaymentMethod;
  cashAmountTjs: number;
  cardAmountTjs: number;
  debtAmountTjs?: number;
  exchangeTradeInCreditTjs?: number;
  status: 'COMPLETED' | 'EXCHANGED' | 'REFUNDED';
  hasBelowCostItem?: boolean;
  exchangeEvents?: ExchangeEvent[];
  refundReason?: string;
  refundedAt?: string;
  refundedBy?: string;
  penaltyFeeTjs?: number;
  penaltyFeeUsd?: number;
  actualRefundAmountTjs?: number;
}

export interface TransferRequest {
  id: string;
  transferNumber: string;
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  deviceIds: string[];
  deviceImeis: string[];
  deviceBrands: string[];
  deviceModels: string[];
  requestedBy: string;
  requestedAt: string;
  status: TransferStatus;
  approvedBy?: string;
  approvedAt?: string;
  rejectedReason?: string;
}

export interface RepairTicket {
  id: string;
  ticketNumber: number;
  deviceId?: string;
  imei: string;
  imei2?: string;
  brand?: string;
  model?: string;
  deviceModel?: string;
  storage?: string;
  color?: string;
  saleReceiptNumber?: number;
  saleDate?: string;
  storeId: string;
  storeName: string;
  intakeSeller: string;
  customerName?: string;
  customerPhone?: string;
  prepaymentTjs?: number;
  problemDescription: string;
  issueDescription?: string;
  visualCondition: string;
  equipmentPackage: string;
  comment?: string;
  status: RepairStatus;
  statusHistory: {
    status: RepairStatus;
    updatedAt: string;
    updatedBy: string;
    note?: string;
  }[];
  createdAt: string;
  updatedAt?: string;
  estimatedCostTjs?: number;
  finalCostTjs?: number;
  repairCostTjs?: number;
  /** USD equivalents, converted at the daily rate in effect on the ticket's own date (not today's). */
  estimatedCostUsd?: number;
  finalCostUsd?: number;
  exchangeRate?: number;
}

export interface InvoiceGroup {
  id?: string;
  brand: string;
  model: string;
  ram?: string;
  storage: string;
  color: string;
  quantity: number;
  purchasePriceUsd: number;
}

export interface SupplierInvoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  date: string;
  totalAmountUsd: number;
  exchangeRate: number;
  paidAmountUsd: number;
  remainingAmountUsd: number;
  status: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';
  devicesCount: number;
  isStorePurchase?: boolean;
  storeId?: string;
  groups?: InvoiceGroup[];
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  contactPerson?: string;
  totalPurchasedUsd: number;
  totalPaidUsd: number;
  totalDebtUsd: number;
  active?: boolean;
  createdAt?: string;
}

export interface SupplierBonus {
  id: string;
  supplierId: string;
  supplierName: string;
  campaignName?: string;
  campaignTitle?: string;
  bonusType?: 'FREE_DEVICES' | 'CASH_DISCOUNT';
  amountUsd?: number;
  exchangeRate: number;
  deviceId?: string;
  imei?: string;
  brand?: string;
  model?: string;
  storage?: string;
  color?: string;
  estimatedValueUsd?: number;
  status?: 'IN_STOCK' | 'SOLD';
  dateReceived?: string;
  date?: string;
  dateSold?: string;
  saleReceiptNumber?: number;
  freeDevices?: {
    brand: string;
    model: string;
    ram?: string;
    storage: string;
    color: string;
    imei: string;
    costBasisUsd: number;
  }[];
}

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  amountTjs: number;
  exchangeRate?: number;
  amountUsd?: number;
  targetType?: 'STORE' | 'BUSINESS';
  storeId?: string;
  storeName?: string;
  sourceAccount?: string; // e.g. "Store #1 Cash", "Main Account"
  comment?: string;
  description?: string;
  createdByName: string;
  paidFromCashRegister?: boolean;
  status: 'PAID' | 'UNPAID';
  paidAt?: string;
  employeeId?: string;
  employeeName?: string;
  isEmployeeAdvance?: boolean;
  /** 'YYYY-MM' payroll month an advance is deducted from. */
  payrollMonth?: string | null;
}

export interface Owner {
  id: string;
  userId?: string;
  name: string;
  profitSharePercent: number; // e.g. 60
  capitalBalanceUsd: number;
  totalAccruedProfitUsd: number;
  totalPaidProfitUsd: number;
  totalReinvestedUsd: number;
  availableProfitUsd: number;
  storeId?: string | null;
}

/** A partner's share of one store's profit; the admin owner receives the rest of that store's profit. */
export interface StoreProfitShare {
  id: string;
  storeId: string;
  ownerId: string;
  sharePercent: number;
}

export interface OwnerTransaction {
  id: string;
  ownerId: string;
  ownerName: string;
  type: 'INVESTMENT' | 'WITHDRAWAL' | 'PROFIT_PAYOUT' | 'REINVEST';
  amountUsd: number;
  exchangeRate: number;
  date: string;
  sourceOrDestination: string;
  createdByName: string;
  note?: string;
}

export interface DailyRate {
  date: string; // YYYY-MM-DD
  rate: number; // 1 USD = X TJS
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  date?: string;
  timestamp?: string;
  targetType?: 'TRANSFER_REQUEST' | 'LOW_STOCK' | 'SYSTEM' | 'REPAIR' | string;
  targetId?: string;
  /** A page id (older notifications) or an app path such as '/receipts?receipt=…'. */
  targetRoute?: PageId | string;
  linkPage?: PageId | string;
  targetRole?: Role;
  targetUserId?: string;
  read?: boolean;
  isRead?: boolean;
  resolved?: boolean;
  readAt?: string;
  resolvedAt?: string;
  /** Facts of the business event behind an admin notification. */
  actionType?: string;
  storeId?: string;
  storeName?: string;
  actorName?: string;
  amountTjs?: number;
  amountUsd?: number;
  documentRef?: string;
  details?: { imeis?: string[] } & Record<string, unknown>;
}

/** A store's receipt of phones delivered from the main warehouse (scanned by IMEI). */
export interface StoreReceiptItem {
  id: string;
  deviceId: string;
  imei: string;
  brand: string;
  model: string;
  ram?: string | null;
  storage: string;
  color: string;
}

export interface StoreReceipt {
  id: string;
  receiptNumber: string;
  storeId: string;
  storeName?: string;
  createdByName: string;
  itemCount: number;
  createdAt: string;
  acknowledgedAt?: string | null;
  acknowledgedByName?: string | null;
  items: StoreReceiptItem[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  userName: string;
  userRole: Role;
  storeName?: string;
  details: string;
  financialDetails?: {
    amountTjs?: number;
    amountUsd?: number;
    exchangeRate?: number;
    purchaseCostUsd?: number;
    salePriceTjs?: number;
    penaltyTjs?: number;
    penaltyUsd?: number;
  };
  imei?: string;
  receiptNumber?: number;
  targetId?: string;
}

export type ThemeMode = 'light' | 'dark';

export type BonusPoolStatus = 'PENDING' | 'DISTRIBUTED' | 'ANNULLED';

export interface BonusPoolEntry {
  id: string;
  deviceId: string;
  saleId?: string;
  saleItemId?: string;
  imei: string;
  brand: string;
  model: string;
  salePriceUsd: number;
  salePriceTjs: number;
  profitUsd: number;
  profitTjs: number;
  status: BonusPoolStatus;
  distributionId?: string;
  distributedAt?: string;
  distributedBy?: string;
  distributionNote?: string;
  annulledAt?: string;
  annulledBy?: string;
  annulledNote?: string;
  createdAt: string;
  sale?: {
    receiptNumber: number;
    createdAt: string;
    storeId: string;
  };
}

export interface BonusDistributionLog {
  id: string;
  periodName: string;
  totalAmountUsd: number;
  totalAmountTjs?: number;
  type: 'DISTRIBUTION' | 'ANNULMENT';
  allocations: { ownerId: string; ownerName?: string; amountUsd: number }[];
  note?: string;
  performedByUserId?: string;
  performedByName?: string;
  createdAt: string;
}
