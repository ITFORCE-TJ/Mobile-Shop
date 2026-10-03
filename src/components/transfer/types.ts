import { Store, Device, TransferRequest, User } from '../../types';

export const isLocationWarehouse = (
  stores: Store[],
  mainWarehouse?: Store,
  id?: string,
  name?: string
): boolean => {
  if (id && mainWarehouse?.id === id) return true;
  if (name && (name.toLowerCase().includes('склад') || name.toLowerCase().includes('warehouse'))) return true;
  const s = stores.find(st => st.id === id);
  return Boolean(s?.isMainWarehouse);
};

export interface TransferLocationSelectorProps {
  stores: Store[];
  mainWarehouse?: Store;
  isStoreScoped: boolean;
  sellerStoreName: string;
  fromLocationId: string;
  toLocationId: string;
  onOriginChange: (id: string) => void;
  onDestinationChange: (id: string) => void;
}

export interface TransferDeviceGridProps {
  availableDevices: Device[];
  selectedDeviceIds: string[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onToggleSelectDevice: (id: string) => void;
  onSelectAllFiltered: () => void;
  onClearSelection: () => void;
  onDeviceCode: (rawCode: string, source: 'camera' | 'enter') => void;
  onScanDevice: () => void;
  isInitialLoading: boolean;
  fromStoreName: string;
}

export interface TransferBottomBarProps {
  selectedCount: number;
  fromStoreName: string;
  toStoreName: string;
  toLocationId: string;
  isStoreScoped: boolean;
  onOpenConfirmModal: () => void;
}

export interface TransferHistoryListProps {
  visibleTransfers: TransferRequest[];
  filteredTransfers: TransferRequest[];
  statusCounts: { ALL: number; PENDING: number; APPROVED: number; REJECTED: number };
  historyStatusFilter: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';
  setHistoryStatusFilter: (status: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED') => void;
  historySearchQuery: string;
  setHistorySearchQuery: (query: string) => void;
  isStoreScoped: boolean;
  isCentralMode: boolean;
  stores: Store[];
  mainWarehouse?: Store;
  historyFilterChoice: string;
  setHistoryFilterChoice: (choice: string) => void;
  expandedTransferIds: Set<string>;
  onToggleExpandTransfer: (id: string) => void;
  copiedImei: string | null;
  onCopyText: (text: string) => void;
  devicesById: Map<string, Device>;
  devicesByImei: Map<string, Device>;
  currentUser: User | null;
  processingTransferId: string | null;
  onApprove: (transferId: string) => void;
  onRequestReject: (transfer: TransferRequest) => void;
  onNavigateToCreate: () => void;
}

export interface ConfirmTransferModalProps {
  open: boolean;
  onClose: () => void;
  isStoreScoped: boolean;
  selectedDevices: Device[];
  fromStore?: Store;
  toStore?: Store;
  fromStoreName: string;
  toStoreName: string;
  isSubmittingTransfer: boolean;
  onConfirm: () => void;
}

export interface RejectTransferModalProps {
  rejectTarget: TransferRequest | null;
  onClose: () => void;
  rejectReason: string;
  setRejectReason: (reason: string) => void;
  processingTransferId: string | null;
  onReject: (transferId: string) => void;
}
