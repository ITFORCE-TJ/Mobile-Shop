import { getBusinessDateKey } from '../../utils/businessDate';
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { FilterPillGroup } from '../ui/FilterPillGroup';
import { RestrictedAccess } from '../ui/RestrictedAccess';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { MonthPicker } from '../ui/MonthPicker';
import { ProfitReport } from '../finance/ProfitReport';
import { StoreRanking } from '../finance/StoreRanking';
import { StoreDashboard } from '../finance/StoreDashboard';
import { CashCollectionPanel } from '../finance/CashCollectionPanel';

type Tab = 'REPORT' | 'RANKING' | 'STORE' | 'STORES' | 'CASH';
const NETWORK_TABS: { value: Tab; label: string }[] = [
  { value: 'REPORT', label: 'Сводка сети' },
  { value: 'RANKING', label: 'Рейтинг филиалов' },
  { value: 'STORE', label: 'Отчёт по точке' },
  { value: 'STORES', label: 'По складам' },
  { value: 'CASH', label: 'Инкассация' },
];
// A store manager sees only their own store — no network summary or comparison.
const MANAGER_TABS: { value: Tab; label: string }[] = [
  { value: 'STORE', label: 'Отчёт по точке' },
  { value: 'CASH', label: 'Инкассация' },
];

export const FinancePage: React.FC = () => {
  const { currentUser, selectedStoreId, setSelectedStoreId } = useAppFields('currentUser', 'selectedStoreId', 'setSelectedStoreId');

  const isSeller = currentUser?.role === 'SELLER';
  const isManager = currentUser?.role === 'STORE_MANAGER';
  const tabs = isManager ? MANAGER_TABS : NETWORK_TABS;

  // The tab lives in the URL (?tab=STORES) so a reload keeps the tab the user was on;
  // no tab param means the page's first tab.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') as Tab | null;
  const tab: Tab = urlTab && tabs.some((t) => t.value === urlTab) ? urlTab : tabs[0].value;
  const setTab = (next: Tab) => setSearchParams(next === tabs[0].value ? {} : { tab: next }, { replace: true });
  const [status, setStatus] = useState<StatusMessage | null>(null);
  // Shared by every tab so switching between them keeps the month.
  const [reportMonth, setReportMonth] = useState(getBusinessDateKey().substring(0, 7));

  // Hooks are unconditional above this point — RestrictedAccess for SELLER is decided
  // only in the render output, matching ExpensesPage/ReportsPage's own gating pattern.
  if (isSeller) {
    return (
      <div className="flex-1 flex flex-col bg-bg">
        <RestrictedAccess message="Раздел финансов доступен администраторам, партнёрам и управляющим магазинов." />
      </div>
    );
  }

  const content = (() => {
    switch (tab) {
      case 'RANKING':
        return (
          <StoreRanking
            month={reportMonth}
            onMonthChange={setReportMonth}
            onOpenStore={(storeId) => { setSelectedStoreId(storeId); setTab('STORE'); }}
          />
        );
      case 'STORE':
        return <StoreDashboard month={reportMonth} onMonthChange={setReportMonth} />;
      case 'CASH':
        return (
          <div className="flex flex-col">
            <div className="px-3 py-2.5 border-b border-border bg-surface">
              <MonthPicker value={reportMonth} onChange={setReportMonth} className="h-9 px-3 rounded-lg border border-accent bg-surface text-xs font-semibold text-accent focus:outline-none" />
            </div>
            <div className="p-3 sm:p-4">
              <CashCollectionPanel storeId={isManager ? currentUser?.storeId || '' : selectedStoreId || 'all'} month={reportMonth} />
            </div>
          </div>
        );
      default:
        return <ProfitReport key={tab} view={tab === 'REPORT' ? 'summary' : 'stores'} month={reportMonth} onMonthChange={setReportMonth} />;
    }
  })();

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      <div className="border-b border-border bg-bg shrink-0 px-3 pt-3 pb-3">
        <FilterPillGroup
          options={tabs}
          value={tab}
          onChange={setTab}
          scrollable
        />
      </div>

      <div className="flex-1 overflow-y-auto">{content}</div>
    </div>
  );
};
