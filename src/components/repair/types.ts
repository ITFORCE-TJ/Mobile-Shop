import { RepairTicket, RepairStatus, Store } from '../../types';

export const getStatusBadge = (status: RepairStatus): { label: string; color: string } => {
  switch (status) {
    case 'ACCEPTED':
      return { label: 'Принят', color: 'bg-info/15 text-info border-info/30' };
    case 'IN_PROGRESS':
      return { label: 'В работе', color: 'bg-warning/15 text-warning border-warning/30' };
    case 'READY':
      return { label: 'Готов', color: 'bg-accent/15 text-accent border-accent/30' };
    case 'ISSUED':
      return { label: 'Выдан', color: 'bg-surface-raised text-fg-subtle border-border' };
    default:
      return { label: status, color: 'bg-surface-raised text-fg-subtle border-border' };
  }
};

export interface RepairTopBarProps {
  activeTab: 'list' | 'create';
  onNavigateToList: () => void;
  onNavigateToCreate: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onScanListSearch: () => void;
  isStoreScoped: boolean;
  isStoreModeCentral: boolean;
  selectedStoreId: string;
  setSelectedStoreId: (storeId: string) => void;
  retailStores: Store[];
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  currentMonthKey: string;
  statusFilter: 'ALL' | RepairStatus;
  setStatusFilter: (filter: 'ALL' | RepairStatus) => void;
  onResetFilters: () => void;
  statusCounts: Record<string, number>;
  totalRepairsCount: number;
  readyRepairsCount: number;
  totalExpensesTjs: number;
}

export interface RepairTicketCardProps {
  ticket: RepairTicket;
  isStoreScoped: boolean;
  updatingTicketId: string | null;
  onViewTicket: (ticket: RepairTicket) => void;
  onUpdateStatusQuick: (ticketId: string, status: RepairStatus) => void;
  onOpenIssueModal: (ticket: RepairTicket) => void;
}

export interface RepairTicketsListProps {
  listLoad: 'loading' | 'done' | 'error';
  filteredRepairs: RepairTicket[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  statusFilter: 'ALL' | RepairStatus;
  setStatusFilter: (filter: 'ALL' | RepairStatus) => void;
  selectedMonth: string;
  onRetryLoad: () => void;
  isStoreScoped: boolean;
  updatingTicketId: string | null;
  onViewTicket: (ticket: RepairTicket) => void;
  onUpdateStatusQuick: (ticketId: string, status: RepairStatus) => void;
  onOpenIssueModal: (ticket: RepairTicket) => void;
}

export interface NewRepairFormProps {
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
  receiptSearch: string;
  setReceiptSearch: (val: string) => void;
  onFindSoldDevice: (query: string) => void;
  onScanTicket: () => void;
  isStoreScoped: boolean;
  createTicketStoreId: string;
  setCreateTicketStoreId: (val: string) => void;
  retailStores: Store[];
  clientName: string;
  setClientName: (val: string) => void;
  clientPhone: string;
  setClientPhone: (val: string) => void;
  deviceModel: string;
  setDeviceModel: (val: string) => void;
  imei: string;
  setImei: (val: string) => void;
  imei2: string;
  setImei2: (val: string) => void;
  defectDescription: string;
  setDefectDescription: (val: string) => void;
}

export interface IssueRepairModalProps {
  selectedTicket: RepairTicket | null;
  onClose: () => void;
  isSubmitting: boolean;
  issueFinalCost: string;
  setIssueFinalCost: (val: string) => void;
  onConfirmIssue: () => void;
}

export interface ViewRepairModalProps {
  viewingTicket: RepairTicket | null;
  onClose: () => void;
  isStoreScoped: boolean;
  updatingTicketId: string | null;
  onUpdateStatusQuick: (ticketId: string, status: RepairStatus) => Promise<boolean>;
  onOpenIssueModal: (ticket: RepairTicket) => void;
}
