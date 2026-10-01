import { getBusinessDateKey } from '../../utils/businessDate';
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { FilterPillGroup } from '../ui/FilterPillGroup';
import { RestrictedAccess } from '../ui/RestrictedAccess';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { ProfitReport } from '../finance/ProfitReport';
import { BonusesFinancePanel } from '../finance/BonusesFinancePanel';
import { CashCollectionPanel } from '../finance/CashCollectionPanel';
import { useStoreContext } from '../../utils/storeContext';

type Tab = 'REPORT' | 'STORES' | 'CASH' | 'BONUSES';
const TABS: { value: Tab; label: string }[] = [
  { value: 'REPORT', label: 'Отчёт' },
  { value: 'STORES', label: 'По магазинам' },
  { value: 'CASH', label: 'Инкассация' },
  { value: 'BONUSES', label: 'Бонусы' },
];

export const FinancePage: React.FC = () => {
  const { currentUser } = useAppFields('currentUser');
  // Admin inside a store sees only that store; Central Cash shows every store.
  const storeCtx = useStoreContext();

  const isSeller = currentUser?.role === 'SELLER';

  // The tab lives in the URL (?tab=STORES) so a reload keeps the tab the user was on;
  // no tab param means the report, which is what the page opens on.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') as Tab | null;
  const tabs = storeCtx.mode === 'STORE' ? TABS.filter((t) => t.value !== 'STORES') : TABS;
  const tab: Tab = urlTab && tabs.some((t) => t.value === urlTab) ? urlTab : 'REPORT';
  const setTab = (next: Tab) => setSearchParams(next === 'REPORT' ? {} : { tab: next }, { replace: true });
  const [status, setStatus] = useState<StatusMessage | null>(null);
  // Shared by the "Отчёт" and "По складам" tabs so switching between them keeps the month.
  const [reportMonth, setReportMonth] = useState(getBusinessDateKey().substring(0, 7));

  // Hooks are unconditional above this point — RestrictedAccess for SELLER is decided
  // only in the render output, matching ExpensesPage/ReportsPage's own gating pattern.
  if (isSeller) {
    return (
      <div className="flex-1 flex flex-col bg-bg">
        <RestrictedAccess message="Раздел финансов доступен только администраторам и партнёрам." />
      </div>
    );
  }

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

      <div className="flex-1 overflow-y-auto">
        {tab === 'BONUSES' ? (
          <BonusesFinancePanel month={reportMonth} onMonthChange={setReportMonth} />
        ) : tab === 'CASH' ? (
          <CashCollectionPanel month={reportMonth} storeId={storeCtx.storeId} />
        ) : (
          <ProfitReport key={tab} view={tab === 'REPORT' ? 'summary' : 'stores'} month={reportMonth} onMonthChange={setReportMonth} />
        )}
      </div>
    </div>
  );
};
