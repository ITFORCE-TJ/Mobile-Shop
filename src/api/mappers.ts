import type { Device, DeviceTimelineEvent, Sale, SaleItem, ExchangeEvent, Supplier, SupplierInvoice, SupplierBonus, Expense, Owner, OwnerTransaction, TransferRequest, RepairTicket, User, Store, NotificationItem, AuditLogEntry, DailyRate } from '../types';

type NameLookup = Map<string, string>;

export function buildNameLookup(users: any[]): NameLookup {
  return new Map(users.map((u) => [u.id, u.name]));
}

function mapTimeline(events: any[]): DeviceTimelineEvent[] {
  return (events || []).map((e) => ({
    id: e.id,
    date: e.date,
    type: e.type,
    description: e.description,
    user: e.userName,
    storeName: e.storeName ?? undefined,
    priceTjs: e.priceTjs ?? undefined,
    priceUsd: e.priceUsd ?? undefined,
  }));
}

export function mapDevice(d: any): Device {
  return {
    id: d.id,
    imei: d.imei,
    imei2: d.imei2 ?? undefined,
    brand: d.brand,
    model: d.model,
    ram: d.ram ?? undefined,
    storage: d.storage,
    color: d.color,
    status: d.status,
    locationId: d.storeId,
    locationName: d.store?.name ?? '',
    supplierId: d.supplierId ?? undefined,
    supplierName: d.supplierName ?? undefined,
    invoiceNumber: d.invoiceNumber ?? undefined,
    purchaseInvoiceId: d.purchaseInvoiceId ?? undefined,
    retailPriceTjs: d.retailPriceTjs ?? undefined,
    receivedDate: d.receivedDate ?? undefined,
    purchaseCostUsd: d.purchasePriceUsd,
    costBasisUsd: d.costBasisUsd,
    isBonus: d.isBonus ?? undefined,
    bonusCampaign: d.bonusCampaign ?? undefined,
    createdAt: d.createdAt,
    timeline: mapTimeline(d.timeline),
  };
}

function mapSaleItem(i: any): SaleItem {
  return {
    deviceId: i.deviceId,
    imei: i.imei,
    imei2: i.imei2 ?? undefined,
    brand: i.brand,
    model: i.model,
    storage: i.storage,
    color: i.color,
    salePriceTjs: i.salePriceTjs,
    salePriceUsd: i.salePriceUsd,
    purchaseCostUsd: i.purchaseCostUsd,
    costBasisUsd: i.costBasisUsd,
    isBelowCost: i.isBelowCost,
  };
}

function mapExchangeEvent(e: any, names: NameLookup): ExchangeEvent {
  return {
    id: e.id,
    date: e.date,
    returnedDeviceId: e.returnedDeviceId,
    returnedImei: e.returnedImei,
    returnedModel: e.returnedModel,
    exchangeInValueTjs: e.exchangeInValueTjs,
    exchangeInValueUsd: e.exchangeInValueUsd,
    replacementDeviceId: e.replacementDeviceId,
    replacementImei: e.replacementImei,
    replacementModel: e.replacementModel,
    newPriceTjs: e.newPriceTjs,
    newPriceUsd: e.newPriceUsd,
    differenceTjs: e.differenceTjs,
    paymentMethod: e.paymentMethod ?? undefined,
    cashAmountTjs: e.cashAmountTjs ?? undefined,
    cardAmountTjs: e.cardAmountTjs ?? undefined,
    exchangeRate: e.exchangeRate,
    processedBy: names.get(e.processedByUserId) || e.processedByUserId,
  };
}

export function mapSale(s: any, names: NameLookup): Sale {
  return {
    id: s.id,
    receiptNumber: s.receiptNumber,
    date: s.createdAt,
    storeId: s.storeId,
    storeName: s.store?.name ?? '',
    sellerId: s.userId,
    sellerName: s.user?.name ?? names.get(s.userId) ?? '',
    customerName: s.customerName ?? undefined,
    customerId: s.customerId ?? undefined,
    items: (s.saleItems || []).map(mapSaleItem),
    totalTjs: s.totalTjs,
    totalUsd: s.totalUsd,
    recognizedProfitUsd: s.recognizedProfitUsd ?? undefined,
    exchangeRate: s.exchangeRate ?? undefined,
    paymentMethod: s.paymentMethod,
    cashAmountTjs: s.cashAmountTjs,
    cardAmountTjs: s.cardAmountTjs,
    debtAmountTjs: s.debtAmountTjs ?? undefined,
    exchangeTradeInCreditTjs: s.exchangeTradeInCreditTjs ?? undefined,
    status: s.status,
    hasBelowCostItem: s.hasBelowCostItem,
    exchangeEvents: (s.exchangeEvents || []).map((e: any) => mapExchangeEvent(e, names)),
    refundReason: s.refundReason ?? undefined,
    refundedAt: s.refundedAt ?? undefined,
    refundedBy: s.refundedByUserId ? names.get(s.refundedByUserId) || s.refundedByUserId : undefined,
    penaltyFeeTjs: s.penaltyFeeTjs ?? undefined,
    penaltyFeeUsd: s.penaltyFeeUsd ?? undefined,
    actualRefundAmountTjs: s.actualRefundAmountTjs ?? undefined,
  };
}

export function mapTransfer(t: any, names: NameLookup): TransferRequest {
  const items = t.items || [];
  return {
    id: t.id,
    transferNumber: t.transferNumber,
    fromLocationId: t.fromStoreId,
    fromLocationName: t.fromStore?.name ?? '',
    toLocationId: t.toStoreId,
    toLocationName: t.toStore?.name ?? '',
    deviceIds: items.map((i: any) => i.deviceId),
    deviceImeis: items.map((i: any) => i.imei),
    deviceBrands: items.map((i: any) => i.brand),
    deviceModels: items.map((i: any) => i.model),
    requestedBy: names.get(t.requestedByUserId) || t.requestedByUserId,
    requestedAt: t.requestedAt,
    status: t.status,
    approvedBy: t.approvedByUserId ? names.get(t.approvedByUserId) || t.approvedByUserId : undefined,
    approvedAt: t.approvedAt ?? undefined,
    rejectedReason: t.rejectedReason ?? undefined,
  };
}

export function mapRepair(r: any, names: NameLookup): RepairTicket {
  return {
    id: r.id,
    ticketNumber: r.ticketNumber,
    deviceId: r.deviceId ?? undefined,
    imei: r.imei,
    imei2: r.imei2 ?? undefined,
    brand: r.brand,
    model: r.model,
    deviceModel: r.model,
    storage: r.storage ?? undefined,
    color: r.color ?? undefined,
    saleReceiptNumber: r.saleReceiptNumber ?? undefined,
    saleDate: r.saleDate ?? undefined,
    storeId: r.storeId,
    storeName: r.store?.name ?? '',
    intakeSeller: r.user?.name ?? names.get(r.userId) ?? '',
    customerName: r.customerName ?? undefined,
    customerPhone: r.customerPhone ?? undefined,
    prepaymentTjs: r.prepaymentTjs ?? undefined,
    problemDescription: r.problemDescription,
    issueDescription: r.problemDescription,
    visualCondition: r.visualCondition ?? '',
    equipmentPackage: r.equipmentPackage ?? '',
    comment: r.comment ?? undefined,
    status: r.status,
    statusHistory: (r.statusHistory || []).map((h: any) => ({
      status: h.status,
      updatedAt: h.updatedAt,
      updatedBy: names.get(h.updatedByUserId) || h.updatedByUserId,
      note: h.note ?? undefined,
    })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt ?? undefined,
    estimatedCostTjs: r.estimatedCostTjs ?? undefined,
    finalCostTjs: r.finalCostTjs ?? undefined,
    repairCostTjs: r.finalCostTjs ?? r.estimatedCostTjs ?? undefined,
    estimatedCostUsd: r.estimatedCostUsd ?? undefined,
    finalCostUsd: r.finalCostUsd ?? undefined,
    exchangeRate: r.exchangeRate ?? undefined,
  };
}

export function mapSupplier(s: any): Supplier {
  return {
    id: s.id,
    name: s.name,
    phone: s.phone ?? undefined,
    contactPerson: s.contactPerson ?? undefined,
    totalPurchasedUsd: s.totalPurchasedUsd,
    totalPaidUsd: s.totalPaidUsd,
    totalDebtUsd: s.totalDebtUsd,
    active: s.active,
    createdAt: s.createdAt,
  };
}

export function mapSupplierInvoice(inv: any): SupplierInvoice {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    supplierId: inv.supplierId,
    supplierName: inv.supplier?.name ?? '',
    date: inv.date,
    totalAmountUsd: inv.totalAmountUsd,
    exchangeRate: inv.exchangeRate,
    paidAmountUsd: inv.paidAmountUsd,
    remainingAmountUsd: inv.remainingAmountUsd,
    status: inv.status,
    devicesCount: inv.devicesCount,
    isStorePurchase: inv.isStorePurchase ?? undefined,
    storeId: inv.storeId ?? undefined,
    groups: Array.isArray(inv.groups)
      ? inv.groups.map((g: any) => ({
          id: g.id,
          brand: g.brand,
          model: g.model,
          ram: g.ram ?? undefined,
          storage: g.storage,
          color: g.color,
          quantity: g.quantity,
          purchasePriceUsd: g.purchasePriceUsd,
        }))
      : undefined,
  };
}

export function mapSupplierBonus(b: any): SupplierBonus {
  const first = (b.freeDevices || [])[0];
  return {
    id: b.id,
    supplierId: b.supplierId,
    supplierName: b.supplier?.name ?? '',
    campaignName: b.campaignTitle ?? undefined,
    campaignTitle: b.campaignTitle ?? undefined,
    bonusType: b.bonusType,
    amountUsd: b.amountUsd ?? undefined,
    exchangeRate: b.exchangeRate,
    deviceId: first?.deviceId ?? undefined,
    imei: first?.imei ?? undefined,
    brand: first?.brand ?? undefined,
    model: first?.model ?? undefined,
    storage: first?.storage ?? undefined,
    color: first?.color ?? undefined,
    estimatedValueUsd: b.amountUsd ?? 0,
    status: b.status ?? undefined,
    dateReceived: b.dateReceived,
    date: b.dateReceived,
    freeDevices: (b.freeDevices || []).map((d: any) => ({
      brand: d.brand,
      model: d.model,
      storage: d.storage,
      color: d.color,
      imei: d.imei,
      costBasisUsd: d.costBasisUsd,
    })),
  };
}

export function mapExpense(e: any, names: NameLookup): Expense {
  return {
    id: e.id,
    date: e.createdAt,
    category: e.category,
    amountTjs: e.amountTjs,
    exchangeRate: e.exchangeRate ?? undefined,
    amountUsd: e.amountUsd ?? undefined,
    targetType: e.targetType,
    storeId: e.storeId ?? undefined,
    storeName: e.store?.name ?? undefined,
    sourceAccount: e.sourceAccount ?? undefined,
    comment: e.comment ?? undefined,
    description: e.description ?? undefined,
    createdByName: names.get(e.createdByUserId) || e.createdByUserId,
    paidFromCashRegister: e.paidFromCashRegister,
    status: e.status === 'UNPAID' ? 'UNPAID' : 'PAID',
    paidAt: e.paidAt ?? undefined,
    employeeId: e.employeeId ?? undefined,
    employeeName: e.employeeId ? names.get(e.employeeId) : undefined,
    isEmployeeAdvance: e.isEmployeeAdvance,
    payrollMonth: e.payrollMonth ?? null,
  };
}

export function mapOwner(o: any): Owner {
  return {
    id: o.id,
    userId: o.userId ?? undefined,
    name: o.name,
    profitSharePercent: o.profitSharePercent,
    capitalBalanceUsd: o.capitalBalanceUsd,
    totalAccruedProfitUsd: o.totalAccruedProfitUsd,
    totalPaidProfitUsd: o.totalPaidProfitUsd,
    totalReinvestedUsd: o.totalReinvestedUsd,
    availableProfitUsd: o.availableProfitUsd,
    reinvestableProfitUsd: o.reinvestableProfitUsd ?? undefined,
    storeId: o.storeId ?? o.user?.storeId ?? undefined,
  };
}

export function mapOwnerTransaction(t: any, ownerNames: NameLookup, userNames: NameLookup): OwnerTransaction {
  return {
    id: t.id,
    ownerId: t.ownerId,
    ownerName: ownerNames.get(t.ownerId) || '',
    type: t.type,
    amountUsd: t.amountUsd,
    exchangeRate: t.exchangeRate ?? undefined,
    date: t.createdAt,
    sourceOrDestination: t.sourceOrDestination ?? '',
    createdByName: userNames.get(t.createdByUserId) || t.createdByUserId,
    note: t.note ?? undefined,
  };
}

export function mapUser(u: any, storeNames: NameLookup): User {
  const isAct = u.active !== undefined ? Boolean(u.active) : (u.isActive !== undefined ? Boolean(u.isActive) : true);
  return {
    id: u.id,
    name: u.name || '',
    login: u.login || '',
    role: u.role || 'SELLER',
    storeId: u.storeId ?? undefined,
    storeName: u.store?.name ?? u.storeName ?? (u.storeId ? storeNames.get(u.storeId) : undefined),
    active: isAct,
    isActive: isAct,
    createdAt: u.createdAt,
    baseSalaryTjs: u.baseSalaryTjs ?? undefined,
    salesCommissionPercent: u.salesCommissionPercent ?? undefined,
  };
}

export function mapStore(s: any): Store {
  return {
    id: s.id,
    name: s.name,
    address: s.address ?? undefined,
    isMainWarehouse: s.isMainWarehouse,
    cashBalanceUsd: s.cashBalanceUsd,
    active: s.active,
  };
}

export function mapNotification(n: any): NotificationItem {
  const rawMsg = n.message || '';
  const cleanMsg = typeof rawMsg === 'string' ? rawMsg.replace(/^TR-[^:]*:\s*/i, '') : rawMsg;

  return {
    id: n.id,
    title: n.title,
    message: cleanMsg,
    date: n.createdAt,
    timestamp: n.createdAt,
    targetType: n.targetType ?? undefined,
    targetId: n.targetId ?? undefined,
    targetRoute: n.targetRoute ?? undefined,
    linkPage: n.targetRoute ?? undefined,
    targetRole: n.targetRole ?? undefined,
    targetUserId: n.targetUserId ?? undefined,
    read: n.read,
    isRead: n.read,
    resolved: n.resolved,
    readAt: n.readAt ?? undefined,
    resolvedAt: n.resolvedAt ?? undefined,
  };
}

export function mapAuditLog(a: any): AuditLogEntry {
  return {
    id: a.id,
    timestamp: a.createdAt,
    action: a.action,
    userName: a.userName ?? 'Система',
    userRole: a.userRole ?? 'ADMIN',
    storeName: a.storeName ?? undefined,
    details: a.details,
    financialDetails: a.financialDetails ?? undefined,
    imei: a.imei ?? undefined,
    receiptNumber: a.receiptNumber ?? undefined,
    targetId: a.targetId ?? undefined,
  };
}


export function mapDailyRate(r: any): DailyRate | null {
  if (!r) return null;
  return {
    date: r.date,
    rate: r.rate,
    createdBy: r.createdByUserId,
    createdAt: r.createdAt,
    updatedBy: r.updatedByUserId ?? undefined,
    updatedAt: r.updatedAt ?? undefined,
  };
}
