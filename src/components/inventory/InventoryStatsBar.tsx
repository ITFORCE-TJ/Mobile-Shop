import React from 'react';
import { formatUsd } from '../../utils/money';
import { Boxes, Sparkles, Layers, DollarSign } from 'lucide-react';
import { StatCard } from '../ui/StatCard';

interface InventoryStatsBarProps {
  filteredUnitsCount: number;
  isFiltered: boolean;
  totalUnitsCount: number;
  filteredDistinctBrandsCount: number;
  distinctBrandCount: number;
  filteredDistinctModelsCount: number;
  distinctModelCount: number;
  isAdmin: boolean;
  filteredStockValueUsd: number;
  stockValueUsd: number;
}

export const InventoryStatsBar: React.FC<InventoryStatsBarProps> = ({
  filteredUnitsCount,
  isFiltered,
  totalUnitsCount,
  filteredDistinctBrandsCount,
  distinctBrandCount,
  filteredDistinctModelsCount,
  distinctModelCount,
  isAdmin,
  filteredStockValueUsd,
  stockValueUsd,
}) => {
  return (
    <>
      {/* Desktop/Tablet Summary Stats Cards */}
      <div className={`hidden sm:grid gap-2 sm:gap-3 ${isAdmin ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
        <StatCard
          label="Единиц в наличии"
          value={`${filteredUnitsCount} шт.`}
          subvalue={isFiltered ? `из ${totalUnitsCount} всего` : undefined}
          icon={Boxes}
        />
        <StatCard
          label="Брендов"
          value={String(filteredDistinctBrandsCount)}
          subvalue={isFiltered ? `из ${distinctBrandCount} всего` : undefined}
          icon={Sparkles}
          tone="accent"
        />
        <StatCard
          label="Моделей"
          value={String(filteredDistinctModelsCount)}
          subvalue={isFiltered ? `из ${distinctModelCount} всего` : undefined}
          icon={Layers}
        />
        {isAdmin && (
          <StatCard
            label="Стоимость склада"
            value={formatUsd(filteredStockValueUsd)}
            subvalue={isFiltered ? `из ${formatUsd(stockValueUsd)} всего` : undefined}
            icon={DollarSign}
            tone="accent"
          />
        )}
      </div>

      {/* Mobile Sleek Compact Metric Bar (saves ~120px of vertical space) */}
      <div
        className={`grid sm:hidden bg-surface-raised border border-border rounded-xl py-1.5 px-0.5 text-center divide-x divide-border shadow-2xs ${
          isAdmin ? 'grid-cols-4' : 'grid-cols-3'
        }`}
      >
        <div className="px-1 min-w-0">
          <span className="text-[9px] font-semibold text-fg-subtle uppercase tracking-wider block truncate">
            Наличие
          </span>
          <span className="text-xs font-black text-fg block truncate mt-0.5">{filteredUnitsCount} шт.</span>
        </div>
        <div className="px-1 min-w-0">
          <span className="text-[9px] font-semibold text-fg-subtle uppercase tracking-wider block truncate">
            Брендов
          </span>
          <span className="text-xs font-black text-accent block truncate mt-0.5">{filteredDistinctBrandsCount}</span>
        </div>
        <div className="px-1 min-w-0">
          <span className="text-[9px] font-semibold text-fg-subtle uppercase tracking-wider block truncate">
            Моделей
          </span>
          <span className="text-xs font-black text-fg block truncate mt-0.5">{filteredDistinctModelsCount}</span>
        </div>
        {isAdmin && (
          <div className="px-1 min-w-0">
            <span className="text-[9px] font-semibold text-fg-subtle uppercase tracking-wider block truncate">
              Склад
            </span>
            <span className="text-xs font-black text-accent block truncate mt-0.5 font-mono">
              {formatUsd(filteredStockValueUsd)}
            </span>
          </div>
        )}
      </div>
    </>
  );
};
