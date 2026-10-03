import React from 'react';
import {
  Search,
  X,
  Building2,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowLeftRight,
  Copy,
  Check,
  Warehouse,
  Store as StoreIcon,
  ArrowRight,
  Smartphone,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { formatStoreName } from '../../utils/storeContext';
import { getPhoneColorHex, formatRam } from '../../utils/phoneSpecs';
import { cn } from '../../utils/cn';
import { TransferHistoryListProps, isLocationWarehouse } from './types';
import { TransferRequest } from '../../types';

export const TransferHistoryList: React.FC<TransferHistoryListProps> = ({
  visibleTransfers,
  filteredTransfers,
  statusCounts,
  historyStatusFilter,
  setHistoryStatusFilter,
  historySearchQuery,
  setHistorySearchQuery,
  isStoreScoped,
  isCentralMode,
  stores,
  mainWarehouse,
  historyFilterChoice,
  setHistoryFilterChoice,
  expandedTransferIds,
  onToggleExpandTransfer,
  copiedImei,
  onCopyText,
  devicesById,
  devicesByImei,
  currentUser,
  processingTransferId,
  onApprove,
  onRequestReject,
  onNavigateToCreate,
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 lg:p-6 space-y-4 bg-bg flex flex-col max-w-4xl xl:max-w-5xl mx-auto w-full">
      {/* Header Toolbar: Search + Location Filter + Quick Status Tabs */}
      <div className="space-y-3 pb-2 border-b border-border/70 shrink-0">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-fg-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
              placeholder="Поиск по номеру, IMEI, модели или точке..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-surface border border-border text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent transition-colors"
            />
            {historySearchQuery && (
              <button
                type="button"
                onClick={() => setHistorySearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Location Filter Dropdown (if central / multi-store) */}
          {!isStoreScoped && isCentralMode && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative flex items-center w-full sm:w-auto">
                <Building2 className="w-3.5 h-3.5 text-accent absolute left-2.5 pointer-events-none" />
                <select
                  value={historyFilterChoice}
                  onChange={(e) => setHistoryFilterChoice(e.target.value)}
                  className="w-full sm:w-auto pl-8 pr-7 py-2 rounded-xl bg-surface border border-border text-xs font-semibold text-fg focus:outline-none focus:border-accent cursor-pointer appearance-none transition-colors"
                >
                  <option value="ALL">Все локации (склад и магазины)</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.isMainWarehouse ? `Центральный склад (${formatStoreName(s.name)})` : formatStoreName(s.name)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-fg-subtle absolute right-2 pointer-events-none" />
              </div>
            </div>
          )}
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-xs">
          <button
            type="button"
            onClick={() => setHistoryStatusFilter('ALL')}
            className={cn(
              'px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 flex items-center gap-1.5',
              historyStatusFilter === 'ALL'
                ? 'bg-accent text-accent-fg shadow-2xs'
                : 'bg-surface border border-border/80 text-fg-muted hover:text-fg hover:bg-surface-raised'
            )}
          >
            <span>Все</span>
            <span className="px-1.5 py-0.2 rounded-md bg-black/10 dark:bg-white/10 text-[10px] font-mono">
              {statusCounts.ALL}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setHistoryStatusFilter('PENDING')}
            className={cn(
              'px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 flex items-center gap-1.5',
              historyStatusFilter === 'PENDING'
                ? 'bg-warning text-black shadow-2xs font-black'
                : 'bg-surface border border-border/80 text-fg-muted hover:text-fg hover:bg-surface-raised'
            )}
          >
            <Clock className="w-3 h-3 text-warning" />
            <span>Ожидают приёмки</span>
            {statusCounts.PENDING > 0 && (
              <span className="px-1.5 py-0.2 rounded-md bg-warning/20 text-warning-fg text-[10px] font-mono font-bold">
                {statusCounts.PENDING}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setHistoryStatusFilter('APPROVED')}
            className={cn(
              'px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 flex items-center gap-1.5',
              historyStatusFilter === 'APPROVED'
                ? 'bg-accent text-accent-fg shadow-2xs'
                : 'bg-surface border border-border/80 text-fg-muted hover:text-fg hover:bg-surface-raised'
            )}
          >
            <CheckCircle2 className="w-3 h-3 text-accent" />
            <span>Выполнены</span>
            <span className="px-1.5 py-0.2 rounded-md bg-black/10 dark:bg-white/10 text-[10px] font-mono">
              {statusCounts.APPROVED}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setHistoryStatusFilter('REJECTED')}
            className={cn(
              'px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 flex items-center gap-1.5',
              historyStatusFilter === 'REJECTED'
                ? 'bg-danger text-white shadow-2xs'
                : 'bg-surface border border-border/80 text-fg-muted hover:text-fg hover:bg-surface-raised'
            )}
          >
            <XCircle className="w-3 h-3 text-danger" />
            <span>Отклонены</span>
            <span className="px-1.5 py-0.2 rounded-md bg-black/10 dark:bg-white/10 text-[10px] font-mono">
              {statusCounts.REJECTED}
            </span>
          </button>
        </div>
      </div>

      {/* Empty State when no transfers exist at all */}
      {visibleTransfers.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto min-h-[260px]">
          <div className="w-14 h-14 rounded-2xl bg-surface-raised border border-border flex items-center justify-center text-fg-subtle mb-3 shadow-xs">
            <Clock className="w-7 h-7" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-fg">
            История перемещений пуста
          </h3>
          <p className="text-xs text-fg-subtle mt-1.5 max-w-xs leading-relaxed">
            Здесь будут отображаться созданные перемещения между складами и магазинами, а также их статусы.
          </p>
          <button
            type="button"
            onClick={onNavigateToCreate}
            className="mt-4 h-9 px-4 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>{isStoreScoped ? 'Создать отправку' : 'Создать перемещение'}</span>
          </button>
        </div>
      ) : filteredTransfers.length === 0 ? (
        /* Empty Search / Filter State */
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto min-h-[240px]">
          <div className="w-12 h-12 rounded-2xl bg-surface-raised border border-border flex items-center justify-center text-fg-subtle mb-3">
            <Search className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-fg">Ничего не найдено</h4>
          <p className="text-xs text-fg-subtle mt-1 max-w-xs">
            По выбранным критериям и фильтрам перемещения отсутствуют.
          </p>
          <button
            type="button"
            onClick={() => { setHistorySearchQuery(''); setHistoryStatusFilter('ALL'); }}
            className="mt-3 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-semibold text-accent hover:bg-surface-raised transition-colors cursor-pointer"
          >
            Сбросить фильтры
          </button>
        </div>
      ) : (
        /* Transfers List */
        <div className="space-y-3.5">
          {filteredTransfers.map((tr: TransferRequest) => {
            const isExpanded = expandedTransferIds.has(tr.id);
            const deviceCount = (tr.deviceIds || []).length;
            const rawModels = tr.deviceModels || [];
            const displayModels = isExpanded || rawModels.length <= 3 ? rawModels : rawModels.slice(0, 3);

            return (
              <div
                key={tr.id}
                className={cn(
                  'p-3.5 sm:p-4 rounded-2xl bg-surface border transition-all duration-200 space-y-3 shadow-2xs hover:shadow-xs',
                  tr.status === 'PENDING_APPROVAL'
                    ? 'border-warning/50 hover:border-warning/70'
                    : tr.status === 'REJECTED'
                    ? 'border-danger/30 hover:border-danger/50'
                    : 'border-border/90 hover:border-border-strong'
                )}
              >
                {/* Card Header: Number, Status, Creator, Date */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/70 pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="w-7 h-7 rounded-lg bg-surface-raised border border-border flex items-center justify-center text-accent shrink-0">
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="font-bold font-mono text-fg text-xs sm:text-sm">
                        Перемещение #{tr.transferNumber || tr.id.slice(-6)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onCopyText(tr.transferNumber || tr.id.slice(-6))}
                        title="Скопировать номер"
                        className="text-fg-subtle hover:text-accent p-0.5 rounded transition-colors cursor-pointer"
                      >
                        {copiedImei === (tr.transferNumber || tr.id.slice(-6)) ? (
                          <Check className="w-3 h-3 text-accent" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>

                    {/* Status Badge */}
                    <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${
                      tr.status === 'APPROVED' ? 'bg-accent/15 text-accent border-accent/30' :
                      tr.status === 'PENDING_APPROVAL' ? 'bg-warning/15 text-warning border-warning/30' :
                      'bg-danger/15 text-danger border-danger/30'
                    }`}>
                      {tr.status === 'APPROVED' && <CheckCircle2 className="w-3 h-3" />}
                      {tr.status === 'PENDING_APPROVAL' && <Clock className="w-3 h-3 animate-pulse" />}
                      {tr.status === 'REJECTED' && <XCircle className="w-3 h-3" />}
                      <span>
                        {tr.status === 'APPROVED' ? 'Выполнено' : tr.status === 'PENDING_APPROVAL' ? 'Ожидает подтверждения' : 'Отклонено'}
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 text-fg-subtle text-[11px] font-medium ml-auto sm:ml-0">
                    {tr.requestedBy && (
                      <span className="hidden sm:inline">
                        Создал: <strong className="text-fg-muted font-semibold">{tr.requestedBy}</strong>
                      </span>
                    )}
                    {tr.requestedAt && (
                      <span className="flex items-center gap-1 bg-surface-raised/70 px-2 py-0.5 rounded-md border border-border/60">
                        <Clock className="w-3 h-3 text-fg-subtle" />
                        <span>{new Date(tr.requestedAt).toLocaleString('ru-RU')}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Route Visualizer Card */}
                <div className="p-3 rounded-xl bg-surface-raised/50 border border-border/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
                  {/* Origin */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center shrink-0 text-accent shadow-2xs">
                      {isLocationWarehouse(stores, mainWarehouse, tr.fromLocationId, tr.fromLocationName) ? (
                        <Warehouse className="w-4 h-4" />
                      ) : (
                        <StoreIcon className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
                        Откуда (Отправитель)
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-fg truncate">
                        {tr.fromLocationName}
                      </div>
                    </div>
                  </div>

                  {/* Direction Arrow Connector */}
                  <div className="flex items-center justify-center shrink-0 self-center">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border text-accent shadow-2xs">
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-bold font-mono text-fg">
                        {deviceCount} шт.
                      </span>
                    </div>
                  </div>

                  {/* Destination */}
                  <div className="flex items-center sm:justify-end gap-2.5 min-w-0 flex-1 sm:text-right">
                    <div className="min-w-0 order-2 sm:order-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
                        Куда (Получатель)
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-fg truncate">
                        {tr.toLocationName}
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center shrink-0 text-accent shadow-2xs order-1 sm:order-2">
                      {isLocationWarehouse(stores, mainWarehouse, tr.toLocationId, tr.toLocationName) ? (
                        <Warehouse className="w-4 h-4" />
                      ) : (
                        <StoreIcon className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Devices Box */}
                <div className="rounded-xl bg-surface-raised/40 border border-border/80 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-surface-raised/80 border-b border-border/70 text-xs">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-3.5 h-3.5 text-accent" />
                      <span className="font-bold text-fg text-xs">
                        Передаваемые устройства
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-surface border border-border font-bold font-mono text-fg-muted">
                        {deviceCount} шт.
                      </span>
                    </div>

                    {rawModels.length > 3 && (
                      <button
                        type="button"
                        onClick={() => onToggleExpandTransfer(tr.id)}
                        className="text-[11px] font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>{isExpanded ? 'Свернуть' : `Показать все (${rawModels.length})`}</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </div>

                  <div className="divide-y divide-border/60">
                    {displayModels.map((mod, idx) => {
                      const deviceId = tr.deviceIds?.[idx];
                      const imei = tr.deviceImeis?.[idx] || '—';
                      const foundDevice = (deviceId ? devicesById.get(deviceId) : null) || (imei !== '—' ? devicesByImei.get(imei) : null);
                      const brand = tr.deviceBrands?.[idx] || foundDevice?.brand || '';
                      const fullName = brand ? `${brand} ${mod}` : (foundDevice ? `${foundDevice.brand} ${foundDevice.model}` : mod);
                      const color = foundDevice?.color;
                      const colorHex = getPhoneColorHex(color);
                      const storage = foundDevice?.storage;
                      const rawRam = formatRam(foundDevice?.ram);
                      const ram = rawRam && storage && !storage.toLowerCase().includes(rawRam.toLowerCase()) ? rawRam : null;

                      return (
                        <div
                          key={idx}
                          className="p-2.5 sm:p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-surface-raised/60 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-surface border border-border flex items-center justify-center shrink-0 text-accent/80">
                              <Smartphone className="w-3.5 h-3.5" />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-fg text-xs truncate">
                                  {fullName}
                                </span>
                                {storage && (
                                  <span className="px-1.5 py-0.2 rounded-md bg-surface border border-border text-[10px] font-bold font-mono text-fg shrink-0">
                                    {storage}
                                  </span>
                                )}
                                {ram && (
                                  <span className="px-1.5 py-0.2 rounded-md bg-accent/10 border border-accent/25 text-[10px] font-bold font-mono text-accent shrink-0">
                                    ОЗУ {ram}
                                  </span>
                                )}
                                {color && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-surface border border-border/60 text-[10px] text-fg-muted shrink-0">
                                    {colorHex && (
                                      <span
                                        className="w-2 h-2 rounded-full border border-black/20 shrink-0"
                                        style={{ backgroundColor: colorHex }}
                                      />
                                    )}
                                    <span>{color}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* IMEI chip with copy button */}
                          <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
                            <button
                              type="button"
                              onClick={() => onCopyText(imei)}
                              title="Скопировать IMEI"
                              className="group flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface border border-border/80 hover:border-accent/50 text-[11px] font-mono text-fg-muted hover:text-fg transition-all cursor-pointer"
                            >
                              <span className="text-[10px] text-fg-subtle font-sans">IMEI:</span>
                              <span className="font-bold text-fg">{imei}</span>
                              {copiedImei === imei ? (
                                <span className="text-accent flex items-center gap-0.5 text-[10px] font-sans font-bold">
                                  <Check className="w-3 h-3" />
                                  <span className="hidden sm:inline">Скопировано</span>
                                </span>
                              ) : (
                                <Copy className="w-3 h-3 text-fg-subtle group-hover:text-accent transition-colors opacity-70 group-hover:opacity-100" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Rejected Reason Banner */}
                {tr.status === 'REJECTED' && tr.rejectedReason && (
                  <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/25 text-xs text-danger flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="font-bold block">Причина отклонения:</span>
                      <span className="text-[11px] text-danger/90">{tr.rejectedReason}</span>
                    </div>
                  </div>
                )}

                {/* Pending Actions */}
                {tr.status === 'PENDING_APPROVAL' && (() => {
                  const isToWarehouse = tr.toLocationId === mainWarehouse?.id || tr.toLocationName?.toLowerCase().includes('склад');
                  const isFromWarehouse = tr.fromLocationId === mainWarehouse?.id || tr.fromLocationName?.toLowerCase().includes('склад');
                  const involvesWarehouse = isToWarehouse || isFromWarehouse;
                  const canApprove = currentUser?.role === 'ADMIN' ||
                    (currentUser?.role === 'PARTNER' && !involvesWarehouse && currentUser.storeId === tr.toLocationId);

                  if (canApprove) {
                    return (
                      <div className="pt-2 border-t border-border/70 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-warning text-xs font-semibold">
                          <Clock className="w-4 h-4 text-warning shrink-0" />
                          <span>Требуется подтверждение приёмки</span>
                        </div>
                        <div className="flex items-center justify-end gap-2.5">
                          <button
                            type="button"
                            onClick={() => onRequestReject(tr)}
                            disabled={processingTransferId === tr.id}
                            className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-danger/10 hover:bg-danger/15 text-danger border border-danger/30 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Отклонить</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onApprove(tr.id)}
                            disabled={processingTransferId === tr.id}
                            className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                          >
                            {processingTransferId === tr.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>{processingTransferId === tr.id ? 'Обработка…' : 'Подтвердить и принять'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="pt-2 border-t border-border/70 flex items-center gap-2 text-xs text-warning bg-warning/10 p-2.5 rounded-xl border border-warning/20">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span className="font-medium">
                        {isToWarehouse
                          ? 'Ожидает приёмки администратором на главном складе'
                          : 'Ожидает подтверждения принимающей стороной в магазине'}
                      </span>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
