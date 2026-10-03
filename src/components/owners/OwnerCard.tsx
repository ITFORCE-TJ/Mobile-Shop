import React from 'react';
import { Plus, ArrowUpRight, Warehouse, Store } from 'lucide-react';
import { formatMoney, decimal, moneyNumber } from '../../utils/money';
import { Owner, Store as StoreType } from '../../types';

interface OwnerCardProps {
  owner: Owner;
  info: { name: string; roleTag: string; roleSub: string };
  share: number | null;
  ownerStore?: StoreType | null;
  ownerShareLabel: string;
  rate: number;
  partnerStoreAssets?: { name: string; stockCostUsd: number; stockCount: number; cashUsd: number } | null;
  activeStores: { id: string; name: string; isMainWarehouse?: boolean }[];
  storeInvestments: Record<string, number>;
  onOpenSharesModal: () => void;
  onOpenTxModal: (type: 'INVESTMENT' | 'WITHDRAWAL') => void;
}

export const OwnerCard: React.FC<OwnerCardProps> = ({
  owner,
  info,
  share,
  ownerStore,
  ownerShareLabel,
  rate,
  partnerStoreAssets,
  activeStores,
  storeInvestments,
  onOpenSharesModal,
  onOpenTxModal,
}) => {
  const capUsd = owner.capitalBalanceUsd ?? 0;
  const capTjs = moneyNumber(decimal(capUsd).mul(rate));
  const profitUsd = owner.availableProfitUsd ?? 0;
  const profitTjs = moneyNumber(decimal(profitUsd).mul(rate));

  return (
    <div className="rounded-xl sm:rounded-2xl bg-surface border border-border p-2.5 sm:p-3.5 space-y-2 hover:border-fg-subtle/50 transition-all shadow-xs flex flex-col justify-between">
      <div className="space-y-2">
        {/* Header: Partner Identity & Share */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent font-black text-xs shrink-0">
              {info.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-bold text-xs sm:text-sm text-fg truncate">
                  {info.name}
                </h3>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider border ${
                    info.roleTag === 'Администратор'
                      ? 'bg-accent/10 border-accent/30 text-accent'
                      : 'bg-info/10 border-info/30 text-info'
                  }`}
                >
                  {info.roleTag}
                </span>
                {ownerStore ? (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider bg-warning/10 border border-warning/30 text-warning truncate max-w-28 sm:max-w-36">
                    {ownerStore.name}
                  </span>
                ) : info.roleTag === 'Администратор' ? (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider bg-accent/10 border border-accent/30 text-accent">
                    Все филиалы
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenSharesModal}
            className="px-2 py-0.5 sm:py-1 rounded-lg bg-surface-raised hover:bg-surface border border-border text-accent font-bold text-[10px] sm:text-xs transition-colors shrink-0 cursor-pointer max-w-36 sm:max-w-48 truncate"
            title="Нажмите для настройки доли"
          >
            {ownerShareLabel}
          </button>
        </div>

        {/* Share Progress Bar */}
        <div className="w-full bg-surface-raised h-1 rounded-full overflow-hidden border border-border">
          <div
            className="bg-accent h-full rounded-full transition-all duration-300"
            style={{ width: `${share === null ? 100 : Math.min(100, Math.max(0, share))}%` }}
          />
        </div>

        {/* Balances: Capital & Available Profit */}
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          {/* Capital in business */}
          <div className="p-2 rounded-xl bg-surface-raised border border-border">
            <span className="text-[9px] font-semibold text-fg-subtle uppercase block truncate">
              Капитал в обороте
            </span>
            <div className="text-xs sm:text-sm font-bold font-mono text-fg mt-0.5">
              ${formatMoney(capUsd)}
            </div>
            <span className="text-[9px] sm:text-[10px] text-fg-subtle block font-mono truncate">
              ≈ {formatMoney(capTjs)} TJS
            </span>
          </div>

          {/* Profit not yet capitalized */}
          <div className="p-2 rounded-xl bg-warning/10 border border-warning/25">
            <span className="text-[9px] font-semibold text-warning uppercase block truncate">
              Прибыль до закрытия
            </span>
            <div className="text-xs sm:text-sm font-bold font-mono text-warning mt-0.5">
              ${formatMoney(profitUsd)}
            </div>
            <span className="text-[9px] sm:text-[10px] text-warning/80 block font-mono truncate">
              ≈ {formatMoney(profitTjs)} TJS
            </span>
          </div>
        </div>

        {/* Attached store stock & cash assets snapshot */}
        {partnerStoreAssets && (
          <div className="p-1.5 sm:p-2 rounded-lg bg-surface-raised border border-border text-[10px] sm:text-[11px] flex flex-wrap items-center justify-between gap-1 shadow-2xs">
            <span className="text-fg-subtle flex items-center gap-1 font-semibold truncate">
              <Store className="w-3 h-3 text-accent shrink-0" />
              {partnerStoreAssets.name}:
            </span>
            <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
              <span className="text-fg-muted">
                Товар: <strong className="text-info font-bold">${formatMoney(partnerStoreAssets.stockCostUsd)}</strong> ({partnerStoreAssets.stockCount} шт)
              </span>
              <span>·</span>
              <span className="text-fg-muted">
                Касса: <strong className="text-accent font-bold">${formatMoney(partnerStoreAssets.cashUsd)}</strong>
              </span>
            </div>
          </div>
        )}

        {/* Lifetime Financial Metrics */}
        <div className="p-1.5 rounded-lg bg-surface-raised/50 border border-border flex items-center justify-around text-center text-xs">
          <div>
            <span className="text-[9px] text-fg-subtle block">Начислено</span>
            <span className="font-bold font-mono text-fg text-[10px] sm:text-[11px] block">
              ${formatMoney(owner.totalAccruedProfitUsd)}
            </span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div>
            <span className="text-[9px] text-fg-subtle block">Выплачено</span>
            <span className="font-bold font-mono text-info text-[10px] sm:text-[11px] block">
              ${formatMoney(owner.totalPaidProfitUsd)}
            </span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div>
            <span className="text-[9px] text-fg-subtle block">Реинвест</span>
            <span className="font-bold font-mono text-accent text-[10px] sm:text-[11px] block">
              ${formatMoney(owner.totalReinvestedUsd)}
            </span>
          </div>
        </div>

        {/* Stores distribution preview */}
        {activeStores.length > 0 && (
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-bold text-fg-subtle block">
              Размещение капитала по локациям:
            </span>
            <div className="flex flex-wrap gap-1">
              {activeStores.map(s => {
                const storeAmt = storeInvestments[s.id] || 0;
                const isWh = s.isMainWarehouse;
                return (
                  <div
                    key={s.id}
                    className="px-1.5 py-0.5 rounded-md bg-surface-raised border border-border text-[9px] sm:text-[10px] flex items-center gap-1"
                  >
                    {isWh ? (
                      <Warehouse className="w-3 h-3 text-warning shrink-0" />
                    ) : (
                      <Store className="w-3 h-3 text-accent shrink-0" />
                    )}
                    <span className="font-medium text-fg-muted truncate max-w-24 sm:max-w-32">{s.name}:</span>
                    <span className="font-bold font-mono text-fg">${formatMoney(storeAmt)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Clean Action Buttons */}
      <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-border">
        <button
          type="button"
          onClick={() => onOpenTxModal('INVESTMENT')}
          className="px-2 py-1.5 rounded-lg bg-surface-raised hover:bg-surface text-accent border border-accent/25 hover:border-accent text-xs font-bold transition-all text-center cursor-pointer shadow-2xs min-h-[32px] flex items-center justify-center gap-1"
          title="Внести личные средства в капитал"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Внести</span>
        </button>
        <button
          type="button"
          onClick={() => onOpenTxModal('WITHDRAWAL')}
          className="px-2 py-1.5 rounded-lg bg-surface-raised hover:bg-surface text-danger border border-danger/25 hover:border-danger text-xs font-bold transition-all text-center cursor-pointer shadow-2xs min-h-[32px] flex items-center justify-center gap-1"
          title="Вывести средства из капитала"
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
          <span>Вывести</span>
        </button>
      </div>
    </div>
  );
};
