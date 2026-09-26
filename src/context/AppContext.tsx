import { fetchAllPages } from '../api/pagination';
import { refreshAfterMutation } from '../utils/refreshAfterMutation';
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { User, Store, Device, Sale, Supplier, SupplierInvoice, SupplierBonus, Expense, Owner, OwnerTransaction, RepairTicket, RepairStatus, TransferRequest, AuditLogEntry, DailyRate, PageId, PaymentMethod, ExpenseCategory, ThemeMode } from '../types';
import { useSharedState } from '../hooks/useSharedState';
import { createStore as createContextStore, useStore, type StoreApi } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';
import { useNotificationsActions } from './NotificationsContext';
import { apiClient } from '../api/client';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { scanCode, cancelScan, isNativeScanner } from '../services/scanner/scannerService';
import { soundEffects } from '../utils/sound';
import {
  buildNameLookup,
  mapDevice,
  mapSale,
  mapTransfer,
  mapRepair,
  mapSupplier,
  mapSupplierInvoice,
  mapSupplierBonus,
  mapExpense,
  mapOwner,
  mapOwnerTransaction,
  mapUser,
  mapStore,
  mapAuditLog,
  mapDailyRate,
} from '../api/mappers';

type ActionResult = { success: boolean; message?: string };

interface AppContextType {
  currentUser: User | null;
  todayRate: DailyRate | null;
  activePage: PageId;
  selectedStoreId: string; // 'all' or store id
  stores: Store[];
  devices: Device[];
  // `devices` excludes SOLD units by default (see fetchDevices) — a device once sold never
  // leaves the table, so it's the one status that grows unbounded over the shop's lifetime.
  // This reaches a specific SOLD device by exact IMEI and merges it in, for the rare lookup
  // (repair intake, inventory scan) that needs sale history the in-stock list doesn't carry.
  findDeviceByImei: (imei: string) => Promise<Device[]>;
  // Every device (any status, including SOLD) from one purchase invoice — for the
  // invoice-detail "which units were sold" view, which the SOLD-excluded default misses.
  findDevicesByInvoice: (invoiceId: string) => Promise<Device[]>;
  sales: Sale[];
  // `sales` only holds a recent, bounded window by default (see fetchSales). This reaches
  // further back — by receipt/IMEI search, by seller (full history), or by an explicit
  // period/month — and merges whatever it finds into `sales`, so every existing
  // `sales.find(...)`/`sales.filter(...)` call site keeps working unchanged once a caller
  // has awaited it once for the record it needed.
  fetchSalesRange: (params: { period?: 'TODAY' | 'MONTH' | 'SPECIFIC_MONTH' | 'ALL'; month?: string; storeId?: string; sellerId?: string; search?: string }) => Promise<Sale[]>;
  transfers: TransferRequest[];
  repairs: RepairTicket[];
  // `repairs` only holds a recent, bounded window by default (see fetchRepairs) — this
  // reaches further back via an explicit period/month, same pattern as fetchSalesRange.
  fetchRepairsRange: (params: { period?: 'TODAY' | 'MONTH' | 'SPECIFIC_MONTH' | 'ALL'; month?: string }) => Promise<RepairTicket[]>;
  suppliers: Supplier[];
  invoices: SupplierInvoice[];
  supplierInvoices: SupplierInvoice[];
  // `invoices` only holds a recent, bounded window by default (see fetchInvoices) — this
  // reaches further back by receipt/IMEI search or an explicit period/month and merges
  // whatever it finds in, same pattern as fetchSalesRange.
  fetchInvoicesRange: (params: { period?: 'TODAY' | 'MONTH' | 'SPECIFIC_MONTH' | 'ALL'; month?: string; search?: string; supplierId?: string }) => Promise<SupplierInvoice[]>;
  bonuses: SupplierBonus[];
  supplierBonuses: SupplierBonus[];
  expenses: Expense[];
  // `expenses` only holds a recent, bounded window by default (see fetchExpenses) — this
  // reaches further back by an explicit period/month, or employeeId for one employee's
  // full advance/expense history, same pattern as fetchSalesRange.
  fetchExpensesRange: (params: { period?: 'TODAY' | 'MONTH' | 'SPECIFIC_MONTH' | 'ALL'; month?: string; employeeId?: string }) => Promise<Expense[]>;
  owners: Owner[];
  ownerTransactions: OwnerTransaction[];
  users: User[];
  // notifications moved to NotificationsContext/useNotifications() (performance audit,
  // P0-2) — they update on every realtime push, unrelated to everything else here, and
  // used to force this whole context (and every page consuming it) to re-render.
  auditLogs: AuditLogEntry[];
  isInitialLoading: boolean;

  // UI states
  isRateModalOpen: boolean;
  isScannerOpen: boolean;
  scannerCallback: ((code: string) => void) | null;
  drawerOpen: boolean;

  // Navigation & UI controls
  login: (login: string, pass: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  setDailyRate: (rate: number) => Promise<{ success: boolean; message?: string }>;
  setActivePage: (page: PageId, navTargetId?: string) => void;
  setSelectedStoreId: (storeId: string) => void;
  setDrawerOpen: (open: boolean) => void;
  openScanner: (callback: (code: string) => void) => void;
  closeScanner: () => void;

  // Business logic operations
  createSale: (params: {
    items: { device: Device; salePriceTjs: number }[];
    paymentMethod: Exclude<PaymentMethod, 'DEBT'>;
    cashAmountTjs: number;
    cardAmountTjs: number;
    customerName?: string;
  }) => Promise<{ success: boolean; receiptNumber?: number; message?: string }>;

  processExchange: (params: {
    originalSaleReceiptNumber?: number | string;
    originalSaleId?: string;
    returnedImei?: string;
    returnedItem?: {
      brand: string;
      model: string;
      storage: string;
      color: string;
      imei: string;
      exchangeInValueTjs: number;
    };
    exchangeInValueTjs?: number;
    replacementDeviceId: string;
    newPriceTjs: number;
    differenceTjs?: number;
    paymentMethod?: PaymentMethod;
    cashAmountTjs?: number;
    cardAmountTjs?: number;
  }) => Promise<{ success: boolean; message?: string }>;

  processRefund: (params: {
    saleId: string;
    reason: string;
    refundAmountTjs: number;
    penaltyFeeTjs?: number;
    paymentMethod: 'CASH' | 'CARD';
  }) => Promise<{ success: boolean; message?: string }>;

  createPurchase: (params: {
    supplierId: string;
    invoiceNumber: string;
    date: string;
    isStorePurchase: boolean;
    storeId?: string;
    groups: {
      brand: string;
      model: string;
      ram?: string;
      storage: string;
      color: string;
      purchasePriceUsd: number;
    }[];
  }) => Promise<{ success: boolean; message?: string }>;

  createSupplier: (params: {
    name: string;
    phone?: string;
    contactPerson?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  updateSupplier: (id: string, data: { name?: string; phone?: string; contactPerson?: string }) => Promise<{ success: boolean; message?: string }>;
  deleteSupplier: (id: string) => Promise<{ success: boolean; message?: string }>;
  updateSupplierInvoice: (id: string, data: { invoiceNumber?: string; date?: string; totalAmountUsd?: number }) => Promise<{ success: boolean; message?: string }>;
  deleteSupplierInvoice: (id: string) => Promise<{ success: boolean; message?: string }>;

  createSupplierBonus: (params: {
    supplierId: string;
    campaignTitle?: string;
    bonusType: 'FREE_DEVICES' | 'CASH_DISCOUNT';
    amountUsd?: number;
    freeDevices?: {
      brand: string;
      model: string;
      storage: string;
      color: string;
      imei: string;
      costBasisUsd: number;
    }[];
    destinationLocationId?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  updateSupplierBonus: (id: string, data: {
    campaignTitle?: string;
    amountUsd?: number;
    freeDevice?: { brand?: string; model?: string; storage?: string; color?: string; imei?: string; imei2?: string };
  }) => Promise<{ success: boolean; message?: string }>;
  deleteSupplierBonus: (id: string) => Promise<{ success: boolean; message?: string }>;

  createTransferRequest: (toLocationIdOrParams: string | { fromLocationId?: string; toLocationId: string; deviceIds: string[] }, deviceIds?: string[]) => Promise<{ success: boolean; message?: string }>;
  approveTransfer: (transferId: string) => Promise<{ success: boolean; message?: string }>;
  rejectTransfer: (transferId: string, reason: string) => Promise<{ success: boolean; message?: string }>;

  createRepairTicket: (params: {
    imei: string;
    imei2?: string;
    brand: string;
    model: string;
    storage: string;
    color: string;
    saleReceiptNumber?: number;
    saleDate?: string;
    customerName?: string;
    customerPhone?: string;
    problemDescription: string;
    visualCondition?: string;
    equipmentPackage?: string;
    comment?: string;
    estimatedCostTjs?: number;
    repairCostTjs?: number;
    prepaymentTjs?: number;
    storeId?: string;
  }) => Promise<{ success: boolean; ticketNumber?: number; message?: string }>;

  updateRepairStatus: (ticketId: string, newStatus: RepairStatus, note?: string, costTjs?: number) => Promise<{ success: boolean; message?: string }>;

  paySupplier: (params: {
    supplierId: string;
    amountUsd: number;
    sourceAccount?: 'MAIN_ACCOUNT' | 'STORE_CASH' | string;
    sourceAccountId?: string;
    storeId?: string;
    note?: string;
  }) => Promise<{ success: boolean; message?: string }>;

  paySupplierInvoice: (params: {
    invoiceId: string;
    amountUsd: number;
    sourceAccountId?: string;
    storeId?: string;
  }) => Promise<{ success: boolean; message?: string }>;

  paySalary: (params: { employeeId: string; month: string; grossTjs: number; note?: string }) => Promise<{ success: boolean; message?: string; amountTjs?: number }>;
  createExpense: (params: {
    category: ExpenseCategory;
    amountTjs: number;
    targetType?: 'STORE' | 'BUSINESS';
    storeId?: string;
    sourceAccount?: string;
    comment?: string;
    description?: string;
    paidFromCashRegister?: boolean;
    employeeId?: string;
    employeeName?: string;
    isEmployeeAdvance?: boolean;
  }) => Promise<{ success: boolean; message?: string }>;
  updateExpense: (id: string, data: { category?: string; amountTjs?: number; storeId?: string; comment?: string; description?: string }) => Promise<{ success: boolean; message?: string }>;
  deleteExpense: (id: string) => Promise<{ success: boolean; message?: string }>;
  payExpense: (id: string, storeId?: string) => Promise<{ success: boolean; message?: string }>;

  createOwnerTransaction: (params: {
    ownerId: string;
    type: 'INVESTMENT' | 'WITHDRAWAL' | 'PROFIT_PAYOUT' | 'REINVEST';
    amountUsd: number;
    note?: string;
  }) => Promise<{ success: boolean; message?: string }>;

  initializeOwners: () => Promise<{ success: boolean; message?: string }>;
  updateOwnerProfitShares: (owner1Share: number | { ownerId: string; sharePercent: number }[], owner2Share?: number, rebalanceBalances?: boolean) => Promise<{ success: boolean; message?: string }>;
  linkOwnerToUser: (ownerId: string, userId: string | null) => Promise<{ success: boolean; message?: string }>;

  createUser: (user: Omit<User, 'id' | 'createdAt'>) => Promise<{ success: boolean; message?: string }>;
  updateUser: (user: User) => Promise<{ success: boolean; message?: string }>;
  deleteUser: (userId: string) => Promise<{ success: boolean; message?: string }>;
  openDailyRateModal: () => void;
  closeDailyRateModal: () => void;
  createStore: (name: string, address?: string) => Promise<{ success: boolean; message?: string }>;
  updateStore: (storeId: string, name: string, address?: string) => Promise<{ success: boolean; message?: string }>;
  deleteStore: (storeId: string) => Promise<{ success: boolean; message?: string }>;
  mergeStores: (sourceStoreId: string, targetStoreId: string) => Promise<{ success: boolean; message?: string }>;
  adjustStoreCashBalance: (storeId: string, newBalanceTjs: number, reason: string) => Promise<{ success: boolean; message?: string }>;
  closeQuarterPeriod: (params: { quarterName: string; transferRemainingToCapital: boolean }) => Promise<{ success: boolean; message?: string }>;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const AppContext = createContext<StoreApi<AppContextType> | null>(null);
const AppLoaderContext = createContext<((keys: readonly (keyof AppContextType)[]) => void) | null>(null);

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const authUser = useAuthStore((s) => s.currentUser);
  const authToken = useAuthStore((s) => s.token);
  // notifications live in their own context now (see NotificationsContext.tsx) — this
  // provider only needs to trigger a refetch on realtime events / bulk-reload, never reads
  // the notification list itself.
  const { fetchNotifications } = useNotificationsActions();

  const [currentUser, setCurrentUserState] = useState<User | null>(authUser);
  const [todayRate, setTodayRateState] = useSharedState<DailyRate | null>(null);
  const [activePage, setActivePageState] = useState<PageId>('SALE');
  const [selectedStoreId, setSelectedStoreIdState] = useState<string>(authUser?.role === 'SELLER' && authUser.storeId ? authUser.storeId : 'all');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [stores, setStores] = useSharedState<Store[]>([]);

  // login() clears storeName to undefined (the store list isn't loaded yet at that point),
  // and nothing ever re-populates it afterwards — so it's resolved here from the live store
  // list instead, for every consumer of currentUser (Drawer, TransferPage, TopBar, ...).
  const resolvedCurrentUser = useMemo<User | null>(() => {
    if (!currentUser) return null;
    const resolvedName = currentUser.storeId ? stores.find((s) => s.id === currentUser.storeId)?.name : undefined;
    return resolvedName && resolvedName !== currentUser.storeName ? { ...currentUser, storeName: resolvedName } : currentUser;
  }, [currentUser, stores]);

  const [users, setUsers] = useSharedState<User[]>([]);
  const [suppliers, setSuppliers] = useSharedState<Supplier[]>([]);
  const [invoices, setInvoices] = useSharedState<SupplierInvoice[]>([]);
  const [devices, setDevices] = useSharedState<Device[]>([]);
  const [sales, setSales] = useSharedState<Sale[]>([]);
  const [transfers, setTransfers] = useSharedState<TransferRequest[]>([]);
  const [repairs, setRepairs] = useSharedState<RepairTicket[]>([]);
  const [bonuses, setBonuses] = useSharedState<SupplierBonus[]>([]);
  const [expenses, setExpenses] = useSharedState<Expense[]>([]);
  const [owners, setOwners] = useSharedState<Owner[]>([]);
  const [ownerTransactions, setOwnerTransactions] = useSharedState<OwnerTransaction[]>([]);
  const [auditLogs, setAuditLogs] = useSharedState<AuditLogEntry[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerCallback, setScannerCallback] = useState<((code: string) => void) | null>(null);

  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('ms_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) {
      console.error(e);
    }
    return 'dark';
  });

  useEffect(() => {
    try {
      localStorage.setItem('ms_theme', theme);
    } catch (e) {
      console.error(e);
    }
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, [theme]);

  const setTheme = (newTheme: ThemeMode) => setThemeState(newTheme);
  const toggleTheme = () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const checkRatePrompt = useCallback((rate: DailyRate | null) => {
    const isRateSet = !!(rate && rate.rate && Number(rate.rate) > 0);
    if (!isRateSet) {
      setIsRateModalOpen(true);
      useUIStore.getState().setDailyRateModalOpen(true);
    } else {
      setIsRateModalOpen(false);
      useUIStore.getState().setDailyRateModalOpen(false);
    }
  }, []);

  // Keep local currentUser mirrored to the auth store and evaluate rate prompt on session start
  useEffect(() => {
    setCurrentUserState(authUser);
    if (authUser) {
      checkRatePrompt(todayRate);
    }
  }, [authUser, todayRate, checkRatePrompt]);

  // ---- Data fetching: the API/Postgres is the single source of truth ----
  const namesRef = useRef(buildNameLookup([]));
  const storeNamesRef = useRef(buildNameLookup([]));
  const ownerNamesRef = useRef(new Map<string, string>());

  const inFlightFetchers = useRef(new Map<string, Promise<unknown>>());
  const coalesceFetch = useCallback(<T,>(key: string, fn: () => Promise<T>): Promise<T> => {
    const existing = inFlightFetchers.current.get(key);
    if (existing) return existing as Promise<T>;
    const task = fn().finally(() => {
      if (inFlightFetchers.current.get(key) === task) {
        inFlightFetchers.current.delete(key);
      }
    });
    inFlightFetchers.current.set(key, task);
    return task;
  }, []);

  const localMutationTimestamps = useRef(new Map<string, number>());
  const MUTATION_ECHO_GRACE_MS = 2000;

  const markLocalMutation = useCallback((fetchKeys: string[]) => {
    const now = Date.now();
    for (const k of fetchKeys) {
      localMutationTimestamps.current.set(k, now);
    }
  }, []);

  const fetchUsers = useCallback(() => coalesceFetch('users', async () => {
    const raw = await apiClient<any[]>('/users');
    namesRef.current = buildNameLookup(raw);
    setUsers(raw.map((u) => mapUser(u, storeNamesRef.current)));
  }), [coalesceFetch]);

  const fetchStores = useCallback(() => coalesceFetch('stores', async () => {
    const raw = await apiClient<any[]>('/stores');
    storeNamesRef.current = new Map(raw.map((s) => [s.id, s.name]));
    setStores(raw.map(mapStore));
    setUsers((prev) => prev.map((u) => ({
      ...u,
      storeName: u.storeName || (u.storeId ? storeNamesRef.current.get(u.storeId) : undefined),
    })));
  }), [coalesceFetch]);

  // excludeSold: a SOLD device never leaves the table, so it's the one status that would
  // otherwise grow this fetch unbounded over the shop's lifetime — everything else (in
  // stock, in transfer, in repair) is capped by real physical inventory. Old sold devices
  // are still reachable on demand via findDeviceByImei.
  const fetchDevices = useCallback(() => coalesceFetch('devices', async () => {
    const raw = await apiClient<any[]>('/devices?excludeSold=true');
    setDevices(raw.map(mapDevice));
  }), [coalesceFetch]);

  const mergeDevicesById = (mapped: Device[]) => {
    setDevices((prev) => {
      const byId = new Map(prev.map((d) => [d.id, d]));
      for (const d of mapped) byId.set(d.id, d);
      return Array.from(byId.values());
    });
  };

  const findDeviceByImei: AppContextType['findDeviceByImei'] = useCallback(async (imei) => {
    const raw = await apiClient<any[]>(`/devices?search=${encodeURIComponent(imei)}`);
    const mapped = raw.map(mapDevice);
    mergeDevicesById(mapped);
    return mapped;
  }, []);

  const findDevicesByInvoice: AppContextType['findDevicesByInvoice'] = useCallback(async (invoiceId) => {
    const raw = await apiClient<any[]>(`/devices?purchaseInvoiceId=${encodeURIComponent(invoiceId)}`);
    const mapped = raw.map(mapDevice);
    mergeDevicesById(mapped);
    return mapped;
  }, []);

  // Bounded by default — the background/startup load used to fetch every sale ever, which
  // only gets slower as the shop's history grows. Anything outside this recent window is
  // reached on demand via fetchSalesRange (search/sellerId/explicit period) instead.
  const fetchSales = useCallback(() => coalesceFetch('sales', async () => {
    const raw = await apiClient<any[]>('/sales?limit=500');
    setSales(raw.map((s) => mapSale(s, namesRef.current)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  }), [coalesceFetch]);

  const fetchSalesRange: AppContextType['fetchSalesRange'] = useCallback(async (params) => {
    const qs = new URLSearchParams();
    if (params.period) qs.set('period', params.period);
    if (params.month) qs.set('month', params.month);
    if (params.storeId) qs.set('storeId', params.storeId);
    if (params.sellerId) qs.set('sellerId', params.sellerId);
    if (params.search) qs.set('search', params.search);
    const raw = await apiClient<any[]>(`/sales?${qs.toString()}`);
    const mapped = raw.map((s) => mapSale(s, namesRef.current));
    setSales((prev) => {
      const byId = new Map(prev.map((s) => [s.id, s]));
      for (const s of mapped) byId.set(s.id, s);
      return Array.from(byId.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });
    return mapped;
  }, []);

  // Bounded — no page needs the full transfer history for correctness (no cross-page
  // lookup depends on it, unlike sales/devices), so a generous cap is enough.
  const fetchTransfers = useCallback(() => coalesceFetch('transfers', async () => {
    const raw = await fetchAllPages<any>('/transfers');
    setTransfers(raw.map((t) => mapTransfer(t, namesRef.current)).sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()));
  }), [coalesceFetch]);

  // Bounded — RepairPage's own month filter (defaults to the current month) reaches
  // further back on demand via fetchRepairsRange.
  const fetchRepairs = useCallback(() => coalesceFetch('repairs', async () => {
    const raw = await apiClient<any[]>('/repairs?limit=500');
    setRepairs(raw.map((r) => mapRepair(r, namesRef.current)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }), [coalesceFetch]);

  const fetchRepairsRange: AppContextType['fetchRepairsRange'] = useCallback(async (params) => {
    const qs = new URLSearchParams();
    if (params.period) qs.set('period', params.period);
    if (params.month) qs.set('month', params.month);
    const raw = await apiClient<any[]>(`/repairs?${qs.toString()}`);
    const mapped = raw.map((r) => mapRepair(r, namesRef.current));
    setRepairs((prev) => {
      const byId = new Map(prev.map((r) => [r.id, r]));
      for (const r of mapped) byId.set(r.id, r);
      return Array.from(byId.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });
    return mapped;
  }, []);

  const fetchSuppliers = useCallback(() => coalesceFetch('suppliers', async () => {
    try {
      const raw = await apiClient<any[]>('/suppliers');
      setSuppliers(raw.map(mapSupplier));
    } catch (error) {
      // ADMIN/PARTNER only — leave empty for SELLER users
      if ((error as { status?: number }).status !== 403) throw error;
    }
  }), [coalesceFetch]);

  // Bounded by default — PurchasePage's own period filter (defaults to the current month,
  // same shape as SalesHistoryPage) reaches further back on demand via fetchInvoicesRange.
  const fetchInvoices = useCallback(() => coalesceFetch('invoices', async () => {
    try {
      const raw = await apiClient<any[]>('/supplier-invoices?limit=500');
      setInvoices(raw.map(mapSupplierInvoice).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (error) {
      // ADMIN/PARTNER only — leave empty for SELLER users
      if ((error as { status?: number }).status !== 403) throw error;
    }
  }), [coalesceFetch]);

  const fetchInvoicesRange: AppContextType['fetchInvoicesRange'] = useCallback(async (params) => {
    const qs = new URLSearchParams();
    if (params.period) qs.set('period', params.period);
    if (params.month) qs.set('month', params.month);
    if (params.search) qs.set('search', params.search);
    if (params.supplierId) qs.set('supplierId', params.supplierId);
    const raw = await apiClient<any[]>(`/supplier-invoices?${qs.toString()}`);
    const mapped = raw.map(mapSupplierInvoice);
    setInvoices((prev) => {
      const byId = new Map(prev.map((i) => [i.id, i]));
      for (const i of mapped) byId.set(i.id, i);
      return Array.from(byId.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });
    return mapped;
  }, []);

  // Bounded — bonus campaigns are infrequent, nowhere near sale/device volume, so a
  // generous cap is enough (no search/widen infrastructure needed).
  const fetchBonuses = useCallback(() => coalesceFetch('bonuses', async () => {
    try {
      const raw = await fetchAllPages<any>('/supplier-bonuses');
      setBonuses(raw.map(mapSupplierBonus).sort((a, b) => new Date(b.dateReceived || b.date || 0).getTime() - new Date(a.dateReceived || a.date || 0).getTime()));
    } catch (error) {
      // ADMIN/PARTNER only — leave empty for SELLER users
      if ((error as { status?: number }).status !== 403) throw error;
    }
  }), [coalesceFetch]);

  // Bounded — ExpensesPage's own month filter (defaults to the current month) and
  // EmployeesPage's payroll/history views reach further back on demand via
  // fetchExpensesRange (period/month, or employeeId for one person's full history).
  const fetchExpenses = useCallback(() => coalesceFetch('expenses', async () => {
    const raw = await apiClient<any[]>('/expenses?limit=500');
    setExpenses(raw.map((e) => mapExpense(e, namesRef.current)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  }), [coalesceFetch]);

  const fetchExpensesRange: AppContextType['fetchExpensesRange'] = useCallback(async (params) => {
    const qs = new URLSearchParams();
    if (params.period) qs.set('period', params.period);
    if (params.month) qs.set('month', params.month);
    if (params.employeeId) qs.set('employeeId', params.employeeId);
    const raw = await apiClient<any[]>(`/expenses?${qs.toString()}`);
    const mapped = raw.map((e) => mapExpense(e, namesRef.current));
    setExpenses((prev) => {
      const byId = new Map(prev.map((e) => [e.id, e]));
      for (const e of mapped) byId.set(e.id, e);
      return Array.from(byId.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });
    return mapped;
  }, []);

  const fetchOwners = useCallback(() => coalesceFetch('owners', async () => {
    try {
      const raw = await apiClient<any[]>('/owners');
      ownerNamesRef.current = new Map(raw.map((o) => [o.id, o.name]));
      setOwners(raw.map(mapOwner));
    } catch (error) {
      // SELLER role is forbidden from this endpoint — leave owners empty, not an error.
      if ((error as { status?: number }).status !== 403) throw error;
    }
  }), [coalesceFetch]);

  // Bounded — owner-level capital moves (investment/withdrawal/payout/reinvest) are
  // nowhere near per-sale volume, so a generous cap is enough.
  const fetchOwnerTransactions = useCallback(() => coalesceFetch('ownerTransactions', async () => {
    try {
      const raw = await fetchAllPages<any>('/owner-transactions');
      setOwnerTransactions(raw.map((t) => mapOwnerTransaction(t, ownerNamesRef.current, namesRef.current)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (error) {
      // ADMIN/PARTNER only
      if ((error as { status?: number }).status !== 403) throw error;
    }
  }), [coalesceFetch]);

  const fetchAuditLogs = useCallback(() => coalesceFetch('auditLogs', async () => {
    try {
      const raw = await fetchAllPages<any>('/audit-logs');
      setAuditLogs(raw.map(mapAuditLog).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch (error) {
      // ADMIN only
      if ((error as { status?: number }).status !== 403) throw error;
    }
  }), [coalesceFetch]);

  const fetchExchangeRate = useCallback(() => coalesceFetch('exchangeRate', async () => {
    const raw = await apiClient<any>('/exchange-rate/today');
    const mapped = mapDailyRate(raw);
    setTodayRateState(mapped);
    checkRatePrompt(mapped);
    return mapped;
  }), [coalesceFetch, checkRatePrompt]);

  const refetchInFlight = useRef<Promise<void> | null>(null);
  const refetchAll = useCallback(() => {
    if (refetchInFlight.current) return refetchInFlight.current;
    const task = (async () => {
      // 1. Critical core data (Users, Stores, Devices/Catalog, Exchange Rate)
      await Promise.all([fetchUsers(), fetchStores(), fetchDevices(), fetchExchangeRate()]);

      // 2. Secondary modules batched to avoid connection pool saturation
      await Promise.all([fetchSales(), fetchTransfers(), fetchRepairs(), fetchExpenses()]);
      await Promise.all([fetchSuppliers(), fetchInvoices(), fetchBonuses(), fetchOwners()]);
      await Promise.all([fetchOwnerTransactions(), fetchNotifications(), fetchAuditLogs()]);
    })();
    refetchInFlight.current = task;
    const clear = () => { if (refetchInFlight.current === task) refetchInFlight.current = null; };
    task.then(clear, clear);
    return task;
  }, [fetchUsers, fetchStores, fetchDevices, fetchSales, fetchTransfers, fetchRepairs, fetchSuppliers, fetchInvoices, fetchBonuses, fetchExpenses, fetchOwners, fetchOwnerTransactions, fetchNotifications, fetchAuditLogs, fetchExchangeRate]);

  const coreReady = useRef<Promise<unknown>>(Promise.resolve());
  const loadedModules = useRef(new Set<() => Promise<unknown>>());
  const pendingModules = useRef(new Map<() => Promise<unknown>, Promise<unknown>>());
  const pageFetchers = useMemo(() => ({
    sales: fetchSales, transfers: fetchTransfers, repairs: fetchRepairs,
    suppliers: fetchSuppliers, invoices: fetchInvoices, supplierInvoices: fetchInvoices,
    bonuses: fetchBonuses, supplierBonuses: fetchBonuses, expenses: fetchExpenses,
    owners: fetchOwners, ownerTransactions: fetchOwnerTransactions, auditLogs: fetchAuditLogs,
  }), [fetchSales, fetchTransfers, fetchRepairs, fetchSuppliers, fetchInvoices, fetchBonuses, fetchExpenses, fetchOwners, fetchOwnerTransactions, fetchAuditLogs]);

  useLayoutEffect(() => {
    loadedModules.current.clear();
    pendingModules.current.clear();
    if (!authToken || !authUser) return;
    let cancelled = false;
    setIsInitialLoading(true);
    coreReady.current = Promise.all([fetchUsers(), fetchStores(), fetchDevices(), fetchExchangeRate()])
      .catch((error) => { console.error('Initial data load failed', error); })
      .finally(() => { if (!cancelled) setIsInitialLoading(false); });
    return () => { cancelled = true; };
  }, [authToken, authUser?.id]);

  const ensurePageData = useCallback((keys: readonly (keyof AppContextType)[]) => {
    if (!authToken) return;
    const load = (fetcher: () => Promise<unknown>): Promise<unknown> => {
      if (loadedModules.current.has(fetcher)) return Promise.resolve();
      const pending = pendingModules.current.get(fetcher);
      if (pending) return pending;
      const task = coreReady.current.then(async () => {
        if (fetcher === fetchOwnerTransactions) await load(fetchOwners);
        await fetcher();
        loadedModules.current.add(fetcher);
        window.dispatchEvent(new Event('business-data-refreshed'));
      });
      pendingModules.current.set(fetcher, task);
      const clear = () => { if (pendingModules.current.get(fetcher) === task) pendingModules.current.delete(fetcher); };
      task.then(clear, clear);
      return task;
    };
    for (const key of keys) {
      const fetcher = pageFetchers[key as keyof typeof pageFetchers];
      if (fetcher) void load(fetcher).catch((error) => console.error('Page data load failed', error));
    }
  }, [authToken, pageFetchers, fetchOwnerTransactions, fetchOwners]);

  // Realtime: route each broadcast to only the data it actually touched instead of
  // reloading the entire app for every terminal on every change (same fix as
  // createSupplierBonus's scoped refetch, applied here to the always-on listener that
  // fires far more often). Anything not explicitly mapped below — including
  // RECONNECTED, since the client may have missed events while offline — still falls
  // back to a full refetchAll() so an unmapped or future event type can't go stale.
  // Maps a broadcast type to the fetches it actually touches — same scoping as before,
  // just returned as data instead of run immediately (see the coalescing buffer below).
  const tasksForRealtimeEvent = useCallback((type: string): Array<() => Promise<unknown>> | null => {
    switch (type) {
      case 'INVENTORY_UPDATE':
        return [fetchDevices, fetchSuppliers, fetchInvoices, fetchBonuses];
      case 'SALE_COMPLETED':
      case 'EXCHANGE_PROCESSED':
      case 'REFUND_PROCESSED':
        return [fetchSales, fetchDevices, fetchStores, fetchOwners];
      case 'EXPENSE_CREATED':
      case 'EXPENSE_UPDATED':
      case 'EXPENSE_DELETED':
        return [fetchExpenses, fetchStores, fetchOwners];
      case 'OWNER_TX':
        return [fetchOwners, fetchOwnerTransactions, fetchStores];
      case 'REPAIR_UPDATED':
        return [fetchRepairs, fetchExpenses, fetchStores, fetchOwners];
      case 'STORE_UPDATED':
        return [fetchStores];
      case 'SUPPLIER_PAYMENT':
        return [fetchSuppliers, fetchInvoices, fetchStores];
      case 'TRANSFER_UPDATED':
        return [fetchTransfers, fetchDevices];
      case 'NOTIFICATION_CREATED':
        return [fetchNotifications];
      case 'USER_UPDATED':
        return [fetchUsers];
      case 'EXCHANGE_RATE_UPDATED':
        return [fetchExchangeRate];
      default:
        return null; // unmapped (including RECONNECTED) — falls back to a full refetchAll
    }
  }, [fetchDevices, fetchSuppliers, fetchInvoices, fetchBonuses, fetchSales, fetchStores, fetchOwners, fetchExpenses, fetchOwnerTransactions, fetchRepairs, fetchTransfers, fetchNotifications, fetchUsers, fetchExchangeRate]);

  // A burst of broadcasts in quick succession (e.g. a multi-item refund, a batch
  // transfer looping individual broadcast() calls) used to fire one full parallel fetch
  // set per message. This coalesces everything that arrives within one short window into
  // a single deduped pass — the same fetch function is only ever called once even if
  // three different event types in the burst all wanted it.
  const fetcherKeyMap = useMemo(() => new Map<() => Promise<unknown>, string>([
    [fetchSales, 'sales'],
    [fetchDevices, 'devices'],
    [fetchStores, 'stores'],
    [fetchOwners, 'owners'],
    [fetchExpenses, 'expenses'],
    [fetchSuppliers, 'suppliers'],
    [fetchInvoices, 'invoices'],
    [fetchBonuses, 'bonuses'],
    [fetchTransfers, 'transfers'],
    [fetchRepairs, 'repairs'],
    [fetchUsers, 'users'],
    [fetchOwnerTransactions, 'ownerTransactions'],
    [fetchAuditLogs, 'auditLogs'],
    [fetchExchangeRate, 'exchangeRate'],
  ]), [
    fetchSales, fetchDevices, fetchStores, fetchOwners, fetchExpenses,
    fetchSuppliers, fetchInvoices, fetchBonuses, fetchTransfers, fetchRepairs,
    fetchUsers, fetchOwnerTransactions, fetchAuditLogs, fetchExchangeRate,
  ]);

  const pendingRealtimeTasks = useRef(new Set<() => Promise<unknown>>());
  const pendingFullRefetch = useRef(false);
  const realtimeFlushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const REALTIME_COALESCE_MS = 120;

  const flushRealtimeTasks = useCallback(() => {
    realtimeFlushTimer.current = undefined;
    if (pendingFullRefetch.current) {
      pendingFullRefetch.current = false;
      pendingRealtimeTasks.current.clear();
      refetchAll().catch((e) => console.error('Realtime resync failed', e))
        .finally(() => window.dispatchEvent(new Event('business-data-refreshed')));
      return;
    }
    const deferred = new Set<() => Promise<unknown>>(Object.values(pageFetchers));
    const now = Date.now();
    const tasks = Array.from(pendingRealtimeTasks.current).filter((task) => {
      if (deferred.has(task) && !loadedModules.current.has(task) && !pendingModules.current.has(task)) {
        return false;
      }
      const key = fetcherKeyMap.get(task);
      if (key) {
        const lastLocal = localMutationTimestamps.current.get(key) || 0;
        if (now - lastLocal < MUTATION_ECHO_GRACE_MS) {
          return false;
        }
      }
      return true;
    });
    pendingRealtimeTasks.current.clear();
    Promise.allSettled(tasks.map((t) => t())).then(results => {
      for (const result of results) if (result.status === 'rejected') console.error('Realtime resync failed', result.reason);
      window.dispatchEvent(new Event('business-data-refreshed'));
    });
  }, [refetchAll, pageFetchers, fetcherKeyMap]);

  useRealtimeSync(authToken, (type: string) => {
    window.dispatchEvent(new Event('business-data-changed'));
    const tasks = tasksForRealtimeEvent(type);
    if (tasks) {
      for (const t of tasks) pendingRealtimeTasks.current.add(t);
    } else {
      pendingFullRefetch.current = true;
    }
    if (realtimeFlushTimer.current === undefined) {
      realtimeFlushTimer.current = setTimeout(flushRealtimeTasks, REALTIME_COALESCE_MS);
    }
  });

  const login = async (loginStr: string, passStr: string) => {
    try {
      const result = await apiClient<{ token: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login: loginStr.trim(), password: passStr }),
      });
      const mappedUser: User = {
        ...result.user,
        storeName: result.user.storeName || (result.user.storeId ? storeNamesRef.current.get(result.user.storeId) : undefined),
      };
      useAuthStore.getState().setAuth(mappedUser, result.token);
      setCurrentUserState(mappedUser);
      if (mappedUser.role === 'SELLER' && mappedUser.storeId) {
        setSelectedStoreIdState(mappedUser.storeId);
      } else {
        setSelectedStoreIdState('all');
      }
      setActivePageState('SALE');
      // The authenticated-data effect performs the initial fetch. Calling refetchAll
      // here as well doubled every API request on login and delayed the first screen.
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Неверный логин или пароль') };
    }
  };

  const logout = () => {
    apiClient('/auth/logout', { method: 'POST' }).catch(() => {});
    useAuthStore.getState().logout();
    setCurrentUserState(null);
  };

  const setDailyRate: AppContextType['setDailyRate'] = async (rate) => {
    try {
      await apiClient('/exchange-rate/today', { method: 'POST', body: JSON.stringify({ rate }) });
      setIsRateModalOpen(false);
      useUIStore.getState().setDailyRateModalOpen(false);
      await fetchExchangeRate();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось установить курс') };
    }
  };

  const setActivePage = (page: PageId, _navTargetId?: string) => {
    setActivePageState(page);
    setDrawerOpen(false);
  };

  const setSelectedStoreId = (storeId: string) => {
    if (currentUser?.role === 'SELLER') return;
    setSelectedStoreIdState(storeId);
  };

  const openScanner = (callback: (code: string) => void) => {
    void scanCode({
      open: (onResult) => {
        setScannerCallback(() => onResult);
        setIsScannerOpen(true);
      },
      close: () => {
        setIsScannerOpen(false);
        setScannerCallback(null);
      },
    }).then((code) => {
      if (code === null) return;
      if (isNativeScanner()) soundEffects.playAddToCartSuccess();
      return callback(code);
    }).catch(() => {
      window.alert('Не удалось завершить сканирование. Закройте и снова откройте приложение.');
    });
  };

  const closeScanner = () => {
    cancelScan();
    setIsScannerOpen(false);
    setScannerCallback(null);
  };

  // ---- Business operations: call the API, then resync from it ----

  const createSale: AppContextType['createSale'] = async ({ items, paymentMethod, cashAmountTjs, cardAmountTjs, customerName }) => {
    // Trust the actual location of the devices in the cart over the (possibly stale,
    // shared-across-pages) selectedStoreId — e.g. an admin who last picked the main
    // warehouse on the Inventory page must not have that leak into a POS sale here.
    const storeId = currentUser?.role === 'SELLER'
      ? currentUser.storeId
      : (items[0]?.device.locationId || (selectedStoreId !== 'all' ? selectedStoreId : undefined));
    if (!storeId) return { success: false, message: 'Не удалось определить магазин для продажи' };

    try {
      const sale = await apiClient<any>('/sales', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          items: items.map((i) => ({ deviceId: i.device.id, salePriceTjs: i.salePriceTjs })),
          paymentMethod,
          cashAmountTjs,
          cardAmountTjs,
          customerName: customerName?.trim() || undefined,
        }),
      });
      markLocalMutation(['sales', 'devices', 'stores', 'owners']);
      await refreshAfterMutation([fetchSales(), fetchDevices(), fetchStores(), fetchOwners()]);
      return { success: true, receiptNumber: sale.receiptNumber };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось выполнить продажу') };
    }
  };

  const processExchange: AppContextType['processExchange'] = async (params) => {
    const returnedImeiStr = (params.returnedImei || params.returnedItem?.imei || '').trim();
    const exchangeInValueTjs = params.exchangeInValueTjs ?? params.returnedItem?.exchangeInValueTjs ?? 0;

    let targetReceiptNum: number | undefined;
    if (typeof params.originalSaleReceiptNumber === 'number') {
      targetReceiptNum = params.originalSaleReceiptNumber;
    } else if (typeof params.originalSaleReceiptNumber === 'string') {
      targetReceiptNum = parseInt(params.originalSaleReceiptNumber.replace('#', ''), 10);
    } else if (params.originalSaleId) {
      targetReceiptNum = parseInt(params.originalSaleId.replace('#', ''), 10);
    }

    let targetSale = sales.find((s) =>
      (targetReceiptNum && !isNaN(targetReceiptNum) && s.receiptNumber === targetReceiptNum) ||
      s.id === params.originalSaleId ||
      s.receiptNumber.toString() === params.originalSaleId?.toString().replace('#', '')
    );
    if (!targetSale && returnedImeiStr) {
      targetSale = sales.find((s) => s.items.some((i) => i.imei === returnedImeiStr));
    }
    if (!targetSale) {
      return { success: false, message: `Продажа с указанным чеком/IMEI не найдена` };
    }

    const returnedItem = params.returnedItem;
    try {
      await apiClient<any>('/exchanges', {
        method: 'POST',
        body: JSON.stringify({
          saleId: targetSale.id,
          returnedImei: returnedImeiStr,
          returnedBrand: returnedItem?.brand ?? 'Apple',
          returnedModel: returnedItem?.model ?? 'iPhone',
          returnedStorage: returnedItem?.storage,
          returnedColor: returnedItem?.color,
          exchangeInValueTjs,
          replacementDeviceId: params.replacementDeviceId,
          newPriceTjs: params.newPriceTjs,
          differenceTjs: params.differenceTjs,
          paymentMethod: params.paymentMethod,
          cashAmountTjs: params.cashAmountTjs,
          cardAmountTjs: params.cardAmountTjs,
        }),
      });
      markLocalMutation(['sales', 'devices', 'stores', 'owners']);
      await refreshAfterMutation([fetchSales(), fetchDevices(), fetchStores(), fetchOwners()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось выполнить обмен') };
    }
  };

  const processRefund: AppContextType['processRefund'] = async ({ saleId, reason, refundAmountTjs, penaltyFeeTjs, paymentMethod }) => {
    try {
      await apiClient(`/sales/${saleId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ reason, refundAmountTjs, penaltyFeeTjs, paymentMethod }),
      });
      markLocalMutation(['sales', 'devices', 'stores', 'owners']);
      await refreshAfterMutation([fetchSales(), fetchDevices(), fetchStores(), fetchOwners()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось выполнить возврат') };
    }
  };

  const createPurchase: AppContextType['createPurchase'] = async ({ supplierId, invoiceNumber, date, isStorePurchase, storeId, groups }) => {
    const destStoreId = isStorePurchase && storeId ? storeId : 'main-warehouse';
    try {
      await apiClient('/purchases', {
        method: 'POST',
        body: JSON.stringify({ supplierId, invoiceNumber, date, isStorePurchase, storeId: destStoreId, groups }),
      });
      markLocalMutation(['devices', 'suppliers', 'invoices', 'bonuses']);
      await refreshAfterMutation([fetchDevices(), fetchSuppliers(), fetchInvoices(), fetchBonuses()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось создать приход') };
    }
  };

  const createSupplier: AppContextType['createSupplier'] = async ({ name, phone, contactPerson }) => {
    try {
      await apiClient('/suppliers', { method: 'POST', body: JSON.stringify({ name, phone, contactPerson }) });
      markLocalMutation(['suppliers']);
      await refreshAfterMutation([fetchSuppliers()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось добавить поставщика') };
    }
  };

  const updateSupplier: AppContextType['updateSupplier'] = async (id, data) => {
    try {
      await apiClient(`/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      markLocalMutation(['devices', 'suppliers', 'invoices', 'bonuses']);
      await refreshAfterMutation([fetchDevices(), fetchSuppliers(), fetchInvoices(), fetchBonuses()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось обновить поставщика') };
    }
  };

  const deleteSupplier: AppContextType['deleteSupplier'] = async (id) => {
    try {
      await apiClient(`/suppliers/${id}`, { method: 'DELETE' });
      markLocalMutation(['devices', 'suppliers', 'invoices', 'bonuses']);
      await refreshAfterMutation([fetchDevices(), fetchSuppliers(), fetchInvoices(), fetchBonuses()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось удалить поставщика') };
    }
  };

  const updateSupplierInvoice: AppContextType['updateSupplierInvoice'] = async (id, data) => {
    try {
      await apiClient(`/supplier-invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      markLocalMutation(['devices', 'suppliers', 'invoices', 'bonuses']);
      await refreshAfterMutation([fetchDevices(), fetchSuppliers(), fetchInvoices(), fetchBonuses()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось обновить накладную') };
    }
  };

  const deleteSupplierInvoice: AppContextType['deleteSupplierInvoice'] = async (id) => {
    try {
      await apiClient(`/supplier-invoices/${id}`, { method: 'DELETE' });
      markLocalMutation(['devices', 'suppliers', 'invoices', 'bonuses']);
      await refreshAfterMutation([fetchDevices(), fetchSuppliers(), fetchInvoices(), fetchBonuses()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось удалить накладную') };
    }
  };

  // Bonuses only touch bonuses/devices(FREE_DEVICES)/owners(CASH_DISCOUNT) — refetching
  // every module in the app (refetchAll) after each save was why this felt slow.
  const refetchAfterBonusChange = () => {
    markLocalMutation(['bonuses', 'devices', 'owners']);
    return refreshAfterMutation([fetchBonuses(), fetchDevices(), fetchOwners()]);
  };

  const createSupplierBonus: AppContextType['createSupplierBonus'] = async ({ supplierId, campaignTitle, bonusType, amountUsd, freeDevices, destinationLocationId }) => {
    try {
      await apiClient('/supplier-bonuses', {
        method: 'POST',
        body: JSON.stringify({ supplierId, campaignTitle, bonusType, amountUsd, freeDevices, destinationStoreId: destinationLocationId }),
      });
      await refetchAfterBonusChange();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось зарегистрировать бонус') };
    }
  };

  const updateSupplierBonus: AppContextType['updateSupplierBonus'] = async (id, data) => {
    try {
      await apiClient(`/supplier-bonuses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      await refetchAfterBonusChange();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось обновить бонус') };
    }
  };

  const deleteSupplierBonus: AppContextType['deleteSupplierBonus'] = async (id) => {
    try {
      await apiClient(`/supplier-bonuses/${id}`, { method: 'DELETE' });
      await refetchAfterBonusChange();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось удалить бонус') };
    }
  };

  const createTransferRequest: AppContextType['createTransferRequest'] = async (toLocationIdOrParams, deviceIdsParam) => {
    let fromLocId = currentUser?.storeId || 'main-warehouse';
    let toLocationId = '';
    let deviceIds: string[] = [];

    if (typeof toLocationIdOrParams === 'object') {
      fromLocId = toLocationIdOrParams.fromLocationId || fromLocId;
      toLocationId = toLocationIdOrParams.toLocationId;
      deviceIds = toLocationIdOrParams.deviceIds;
    } else {
      toLocationId = toLocationIdOrParams;
      deviceIds = deviceIdsParam || [];
    }

    try {
      await apiClient('/transfers', {
        method: 'POST',
        body: JSON.stringify({ fromStoreId: fromLocId, toStoreId: toLocationId, deviceIds }),
      });
      markLocalMutation(['transfers', 'devices']);
      await refreshAfterMutation([fetchTransfers(), fetchDevices()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось создать перемещение') };
    }
  };

  const approveTransfer: AppContextType['approveTransfer'] = async (transferId) => {
    try {
      await apiClient(`/transfers/${transferId}/approve`, { method: 'POST' });
      markLocalMutation(['transfers', 'devices']);
      await refreshAfterMutation([fetchTransfers(), fetchDevices()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось подтвердить перемещение') };
    }
  };

  const rejectTransfer: AppContextType['rejectTransfer'] = async (transferId, reason) => {
    try {
      await apiClient(`/transfers/${transferId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
      markLocalMutation(['transfers', 'devices']);
      await refreshAfterMutation([fetchTransfers(), fetchDevices()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось отклонить перемещение') };
    }
  };

  const createRepairTicket: AppContextType['createRepairTicket'] = async (data) => {
    const storeId = currentUser?.storeId || data.storeId || stores.find((s) => !s.isMainWarehouse)?.id || stores[0]?.id;
    if (!storeId) return { success: false, message: 'Не удалось определить магазин' };

    try {
      const ticket = await apiClient<any>('/repairs', {
        method: 'POST',
        body: JSON.stringify({ ...data, storeId }),
      });
      markLocalMutation(['repairs']);
      await refreshAfterMutation([fetchRepairs()]);
      return { success: true, ticketNumber: ticket.ticketNumber };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось оформить ремонт') };
    }
  };

  const updateRepairStatus: AppContextType['updateRepairStatus'] = async (ticketId, newStatus, note, costTjs) => {
    try {
      await apiClient(`/repairs/${ticketId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, note, finalCostTjs: costTjs }),
      });
      markLocalMutation(['repairs', 'expenses', 'stores', 'owners']);
      await refreshAfterMutation([fetchRepairs(), fetchExpenses(), fetchStores(), fetchOwners()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось обновить статус ремонта') };
    }
  };

  const paySupplier: AppContextType['paySupplier'] = async ({ supplierId, amountUsd, storeId, sourceAccountId, note }) => {
    const resolvedStoreId = storeId || sourceAccountId;
    if (!resolvedStoreId) return { success: false, message: 'Выберите кассу, из которой оплатить' };
    try {
      await apiClient(`/suppliers/${supplierId}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amountUsd,
          sourceAccount: 'STORE_CASH',
          storeId: resolvedStoreId,
          note,
        }),
      });
      markLocalMutation(['suppliers', 'invoices', 'stores']);
      await refreshAfterMutation([fetchSuppliers(), fetchInvoices(), fetchStores()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось провести оплату поставщику') };
    }
  };

  const paySupplierInvoice: AppContextType['paySupplierInvoice'] = async ({ invoiceId, amountUsd, storeId, sourceAccountId }) => {
    const resolvedStoreId = storeId || sourceAccountId;
    if (!resolvedStoreId) return { success: false, message: 'Выберите кассу, из которой оплатить' };
    try {
      await apiClient(`/supplier-invoices/${invoiceId}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amountUsd,
          sourceAccount: 'STORE_CASH',
          storeId: resolvedStoreId,
        }),
      });
      markLocalMutation(['suppliers', 'invoices', 'stores']);
      await refreshAfterMutation([fetchSuppliers(), fetchInvoices(), fetchStores()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось провести оплату по накладной') };
    }
  };

  const paySalary: AppContextType['paySalary'] = async ({ employeeId, ...params }) => {
    try {
      const expense = await apiClient<{ amountTjs: number }>(`/payroll/${employeeId}/payout`, { method: 'POST', body: JSON.stringify(params) });
      markLocalMutation(['expenses', 'stores', 'owners']);
      await refreshAfterMutation([fetchExpenses(), fetchStores(), fetchOwners()]);
      return { success: true, amountTjs: expense.amountTjs };
    } catch (err) { return { success: false, message: errorMessage(err, 'Не удалось выплатить зарплату') }; }
  };

  const createExpense: AppContextType['createExpense'] = async ({ category, amountTjs, targetType, storeId, sourceAccount, comment, description, paidFromCashRegister, employeeId, isEmployeeAdvance }) => {
    try {
      await apiClient('/expenses', {
        method: 'POST',
        body: JSON.stringify({ category, amountTjs, targetType, storeId, sourceAccount, comment, description, paidFromCashRegister, employeeId, isEmployeeAdvance }),
      });
      markLocalMutation(['expenses', 'stores', 'owners']);
      await refreshAfterMutation([fetchExpenses(), fetchStores(), fetchOwners()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось зарегистрировать расход') };
    }
  };

  const updateExpense: AppContextType['updateExpense'] = async (id, data) => {
    try {
      await apiClient(`/expenses/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      markLocalMutation(['expenses', 'stores', 'owners']);
      await refreshAfterMutation([fetchExpenses(), fetchStores(), fetchOwners()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось обновить расход') };
    }
  };

  const deleteExpense: AppContextType['deleteExpense'] = async (id) => {
    try {
      await apiClient(`/expenses/${id}`, { method: 'DELETE' });
      markLocalMutation(['expenses', 'stores', 'owners']);
      await refreshAfterMutation([fetchExpenses(), fetchStores(), fetchOwners()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось удалить расход') };
    }
  };

  const payExpense: AppContextType['payExpense'] = async (id, storeId) => {
    try {
      await apiClient(`/expenses/${id}/pay`, { method: 'POST', body: JSON.stringify({ storeId }) });
      markLocalMutation(['expenses', 'stores']);
      await refreshAfterMutation([fetchExpenses(), fetchStores()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось оплатить расход') };
    }
  };

  const initializeOwners: AppContextType['initializeOwners'] = async () => {
    try {
      await apiClient('/owners/init', { method: 'POST' });
      markLocalMutation(['owners', 'ownerTransactions']);
      await refreshAfterMutation([fetchOwners(), fetchOwnerTransactions()]);
      return { success: true };
    } catch (err) {
      try {
        await refreshAfterMutation([fetchOwners()]);
        return { success: true };
      } catch (innerErr) {
        return { success: false, message: errorMessage(err, 'Не удалось инициализировать владельцев') };
      }
    }
  };

  const ownerInvestment = async (ownerId: string, amountUsd: number, destination: string, note?: string): Promise<ActionResult> => {
    try {
      await apiClient(`/owners/${ownerId}/investment`, { method: 'POST', body: JSON.stringify({ amountUsd, destination, note }) });
      markLocalMutation(['owners', 'ownerTransactions', 'stores']);
      await refreshAfterMutation([fetchOwners(), fetchOwnerTransactions(), fetchStores()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Нет прав') };
    }
  };

  const ownerCapitalWithdrawal = async (ownerId: string, amountUsd: number, source: string, note?: string): Promise<ActionResult> => {
    try {
      await apiClient(`/owners/${ownerId}/withdrawal`, { method: 'POST', body: JSON.stringify({ amountUsd, source, note }) });
      markLocalMutation(['owners', 'ownerTransactions', 'stores']);
      await refreshAfterMutation([fetchOwners(), fetchOwnerTransactions(), fetchStores()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Сумма изъятия превышает текущий капитал') };
    }
  };

  const ownerProfitPayout = async (ownerId: string, amountUsd: number, source: string, note?: string): Promise<ActionResult> => {
    try {
      await apiClient(`/owners/${ownerId}/payout`, { method: 'POST', body: JSON.stringify({ amountUsd, source, note }) });
      markLocalMutation(['owners', 'ownerTransactions', 'stores']);
      await refreshAfterMutation([fetchOwners(), fetchOwnerTransactions(), fetchStores()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Сумма выплаты превышает доступную прибыль') };
    }
  };

  const ownerReinvest = async (ownerId: string, amountUsd: number, note?: string): Promise<ActionResult> => {
    try {
      await apiClient(`/owners/${ownerId}/reinvest`, { method: 'POST', body: JSON.stringify({ amountUsd, note }) });
      markLocalMutation(['owners', 'ownerTransactions']);
      await refreshAfterMutation([fetchOwners(), fetchOwnerTransactions()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Сумма реинвестирования превышает доступную прибыль') };
    }
  };

  const createOwnerTransaction: AppContextType['createOwnerTransaction'] = async ({ ownerId, type, amountUsd, note }) => {
    if (type === 'INVESTMENT') return ownerInvestment(ownerId, amountUsd, 'Главный счет', note);
    if (type === 'WITHDRAWAL') return ownerCapitalWithdrawal(ownerId, amountUsd, 'Главный счет', note);
    if (type === 'PROFIT_PAYOUT') return ownerProfitPayout(ownerId, amountUsd, 'Главный счет', note);
    if (type === 'REINVEST') return ownerReinvest(ownerId, amountUsd, note);
    return { success: false, message: 'Неизвестный тип операции' };
  };

  const updateOwnerProfitShares: AppContextType['updateOwnerProfitShares'] = async (owner1ShareOrShares, owner2Share, rebalanceBalances = false) => {
    const shares = Array.isArray(owner1ShareOrShares)
      ? owner1ShareOrShares
      : [
          { ownerId: owners[0]?.id, sharePercent: owner1ShareOrShares },
          { ownerId: owners[1]?.id, sharePercent: owner2Share ?? 100 - owner1ShareOrShares },
        ];
    try {
      await apiClient('/owners/profit-shares', { method: 'POST', body: JSON.stringify({ shares, rebalanceBalances }) });
      markLocalMutation(['owners']);
      await refreshAfterMutation([fetchOwners()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Сумма долей должна равняться 100%') };
    }
  };

  const linkOwnerToUser: AppContextType['linkOwnerToUser'] = async (ownerId, userId) => {
    try {
      await apiClient(`/owners/${ownerId}/link-user`, { method: 'POST', body: JSON.stringify({ userId }) });
      markLocalMutation(['owners']);
      await refreshAfterMutation([fetchOwners()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось привязать аккаунт') };
    }
  };

  const createUser: AppContextType['createUser'] = async (userData) => {
    try {
      await apiClient('/users', {
        method: 'POST',
        body: JSON.stringify({
          login: userData.login,
          password: userData.passwordHash || userData.pin,
          name: userData.name,
          role: userData.role,
          storeId: userData.storeId,
          baseSalaryTjs: userData.baseSalaryTjs,
          salesCommissionPercent: userData.salesCommissionPercent,
        }),
      });
      markLocalMutation(['users']);
      await refreshAfterMutation([fetchUsers()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Пользователь с таким логином уже существует') };
    }
  };

  const updateUser: AppContextType['updateUser'] = async (userData) => {
    try {
      const updated = await apiClient<any>(`/users/${userData.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          login: userData.login,
          password: userData.passwordHash && userData.passwordHash.trim() ? userData.passwordHash.trim() : undefined,
          name: userData.name,
          role: userData.role,
          storeId: userData.storeId ?? null,
          baseSalaryTjs: userData.baseSalaryTjs,
          salesCommissionPercent: userData.salesCommissionPercent,
        }),
      });
      // The general update endpoint doesn't touch active status — that's a
      // dedicated ADMIN-only action that also force-disconnects a deactivated
      // user's live session, so it has to go through its own endpoint.
      const nextActive = userData.isActive ?? userData.active;
      if (nextActive !== undefined) {
        await apiClient(`/users/${userData.id}/status`, { method: 'PATCH', body: JSON.stringify({ active: nextActive }) });
      }
      markLocalMutation(['users', 'owners']);
      await refreshAfterMutation([fetchUsers()]);
      if (currentUser?.id === userData.id) {
        const mapped = mapUser(updated, storeNamesRef.current);
        useAuthStore.getState().setAuth(mapped, authToken || '');
        setCurrentUserState(mapped);
      }
      await refreshAfterMutation([fetchOwners()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось обновить данные сотрудника') };
    }
  };

  const deleteUser: AppContextType['deleteUser'] = async (userId) => {
    try {
      await apiClient(`/users/${userId}`, { method: 'DELETE' });
      markLocalMutation(['users']);
      await refreshAfterMutation([fetchUsers()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось удалить сотрудника (возможно, у него есть история операций)') };
    }
  };

  const openDailyRateModal = () => {
    setIsRateModalOpen(true);
    useUIStore.getState().setDailyRateModalOpen(true);
  };

  // Mirrors setDailyRate's own cleanup (see below) for the Cancel path — opening this modal
  // sets both isRateModalOpen and the UI store's flag, so dismissing it without saving must
  // clear both too, or the modal stays stuck open (isOpen is an OR of the two).
  const closeDailyRateModal = () => {
    setIsRateModalOpen(false);
    useUIStore.getState().setDailyRateModalOpen(false);
  };

  const createStore: AppContextType['createStore'] = async (name, address) => {
    try {
      await apiClient('/stores', { method: 'POST', body: JSON.stringify({ name, address }) });
      markLocalMutation(['stores']);
      await refreshAfterMutation([fetchStores()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Укажите название магазина') };
    }
  };

  const updateStore: AppContextType['updateStore'] = async (storeId, name, address) => {
    try {
      await apiClient(`/stores/${storeId}`, { method: 'PATCH', body: JSON.stringify({ name, address }) });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Укажите название филиала') };
    }
  };

  const deleteStore: AppContextType['deleteStore'] = async (storeId) => {
    try {
      await apiClient(`/stores/${storeId}`, { method: 'DELETE' });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось удалить магазин') };
    }
  };

  const mergeStores: AppContextType['mergeStores'] = async (sourceStoreId, targetStoreId) => {
    try {
      await apiClient(`/stores/${sourceStoreId}/merge`, { method: 'POST', body: JSON.stringify({ targetStoreId }) });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось объединить магазины') };
    }
  };

  const adjustStoreCashBalance: AppContextType['adjustStoreCashBalance'] = async (storeId, newBalanceTjs, reason) => {
    try {
      await apiClient(`/stores/${storeId}/adjust-cash`, { method: 'POST', body: JSON.stringify({ newBalanceTjs, reason }) });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось скорректировать кассу') };
    }
  };

  const closeQuarterPeriod: AppContextType['closeQuarterPeriod'] = async ({ quarterName, transferRemainingToCapital }) => {
    try {
      await apiClient('/owners/quarter-close', { method: 'POST', body: JSON.stringify({ quarterName, transferRemainingToCapital }) });
      markLocalMutation(['owners']);
      await refreshAfterMutation([fetchOwners()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Нет прав') };
    }
  };



  // Every field/function below is redefined on each render (plain consts in the
  // component body, not individually useCallback-wrapped) — but since they all
  // close over the SAME state tracked in this dependency array, memoizing the
  // whole value object here is safe: whenever none of this state actually
  // changed, the cached object (including its functions, captured at the last
  // render where the tracked state matched) is functionally identical to a
  // freshly-built one. Without this, every one of the ~25 useApp() consumers in
  // the tree re-rendered on ANY AppProvider re-render, including ones driven by
  // state a given consumer never reads (e.g. a notifications refetch forcing
  // SalePage to re-render).
  const contextValue = useMemo<AppContextType>(() => ({
        currentUser: resolvedCurrentUser,
        todayRate,
        activePage,
        selectedStoreId,
        stores,
        devices,
        findDeviceByImei,
        findDevicesByInvoice,
        sales,
        fetchSalesRange,
        transfers,
        repairs,
        fetchRepairsRange,
        suppliers,
        invoices,
        supplierInvoices: invoices,
        fetchInvoicesRange,
        bonuses,
        supplierBonuses: bonuses,
        expenses,
        fetchExpensesRange,
        owners,
        ownerTransactions,
        users,
        auditLogs,
        isInitialLoading,
        isRateModalOpen,
        isScannerOpen,
        scannerCallback,
        drawerOpen,
        login,
        logout,
        setDailyRate,
        openDailyRateModal,
        closeDailyRateModal,
        setActivePage,
        setSelectedStoreId,
        setDrawerOpen,
        openScanner,
        closeScanner,
        createSale,
        processExchange,
        processRefund,
        createPurchase,
        createSupplier,
        updateSupplier,
        deleteSupplier,
        updateSupplierInvoice,
        deleteSupplierInvoice,
        createSupplierBonus,
        updateSupplierBonus,
        deleteSupplierBonus,
        createTransferRequest,
        approveTransfer,
        rejectTransfer,
        createRepairTicket,
        updateRepairStatus,
        paySupplier,
        paySupplierInvoice,
        createExpense,
        paySalary,
        updateExpense,
        deleteExpense,
        payExpense,
        initializeOwners,
        createOwnerTransaction,
        updateOwnerProfitShares,
        linkOwnerToUser,
        createUser,
        updateUser,
        deleteUser,
        createStore,
        updateStore,
        deleteStore,
        mergeStores,
        adjustStoreCashBalance,
        closeQuarterPeriod,
        theme,
        setTheme,
        toggleTheme
  }), [
    resolvedCurrentUser, todayRate, activePage, selectedStoreId, stores, devices, sales,
    transfers, repairs, suppliers, invoices, bonuses, expenses, owners,
    ownerTransactions, users, auditLogs, isInitialLoading,
    isRateModalOpen, isScannerOpen, scannerCallback, drawerOpen, theme, authToken,
  ]);

  // Stable action identities let consumers subscribe to data fields independently.
  // Delegates always use the latest committed closures, preserving existing behavior.
  const latestValue = useRef(contextValue);
  const storeRef = useRef<StoreApi<AppContextType> | null>(null);
  if (!storeRef.current) {
    const initial = { ...contextValue };
    for (const key of Object.keys(initial) as (keyof AppContextType)[]) {
      if (key !== 'scannerCallback' && typeof initial[key] === 'function') {
        (initial as unknown as Record<string, unknown>)[key] = (...args: unknown[]) =>
          (latestValue.current[key] as (...values: unknown[]) => unknown)(...args);
      }
    }
    storeRef.current = createContextStore(() => initial);
  }
  useLayoutEffect(() => {
    latestValue.current = contextValue;
    const values: Partial<AppContextType> = {};
    for (const key of Object.keys(contextValue) as (keyof AppContextType)[]) {
      if (key === 'scannerCallback' || typeof contextValue[key] !== 'function') {
        (values as Record<string, unknown>)[key] = contextValue[key];
      }
    }
    storeRef.current!.setState(values);
  }, [contextValue]);

  return (
    <AppLoaderContext.Provider value={ensurePageData}>
      <AppContext.Provider value={storeRef.current}>{children}</AppContext.Provider>
    </AppLoaderContext.Provider>
  );
};

export function useAppFields<K extends keyof AppContextType>(...keys: K[]): Pick<AppContextType, K> {
  const store = useContext(AppContext);
  const load = useContext(AppLoaderContext);
  if (!store) throw new Error('useAppFields must be used within AppProvider');
  const keySignature = keys.join(',');
  const selector = useMemo(
    () => (state: AppContextType) => {
      const slice = {} as Pick<AppContextType, K>;
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        slice[k] = state[k];
      }
      return slice;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keySignature]
  );
  const fields = useStore(store, useShallow(selector));
  useEffect(() => { load?.(keys); }, [load, keySignature]);
  return fields;
}
