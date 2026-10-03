import React from 'react';
import { Wrench, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { LoadingState } from '../ui/Skeleton';
import { RepairTicketCard } from './RepairTicketCard';
import { RepairTicketsListProps } from './types';
import { RepairTicket } from '../../types';

export const RepairTicketsList: React.FC<RepairTicketsListProps> = ({
  listLoad,
  filteredRepairs,
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  selectedMonth,
  onRetryLoad,
  isStoreScoped,
  updatingTicketId,
  onViewTicket,
  onUpdateStatusQuick,
  onOpenIssueModal,
}) => {
  if (listLoad === 'loading' && filteredRepairs.length === 0) {
    return <LoadingState label="Загрузка ремонтов…" />;
  }

  if (listLoad === 'error' && filteredRepairs.length === 0) {
    return (
      <div className="p-8 text-center space-y-3 my-auto">
        <p className="text-sm text-fg-muted">Не удалось загрузить ремонты за период. Проверьте подключение к интернету.</p>
        <Button onClick={onRetryLoad}>Повторить</Button>
      </div>
    );
  }

  if (filteredRepairs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-8 px-4 text-center my-auto min-h-[300px]">
        <div className="w-13 h-13 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-3 shadow-xs">
          <Wrench className="w-6 h-6" />
        </div>

        <h3 className="text-sm sm:text-base font-bold text-fg">
          {searchQuery
            ? 'Ничего не найдено'
            : statusFilter !== 'ALL'
            ? `Нет квитанций со статусом «${statusFilter === 'ACCEPTED' ? 'Приняты' : statusFilter === 'IN_PROGRESS' ? 'В работе' : statusFilter === 'READY' ? 'Готовы' : 'Выданы'}»`
            : 'Квитанции на ремонт не найдены'}
        </h3>

        <p className="text-xs text-fg-subtle mt-1.5 max-w-xs leading-relaxed">
          {searchQuery
            ? `По запросу «${searchQuery}» совпадений не найдено. Проверьте номер чека, имя клиента или IMEI.`
            : statusFilter !== 'ALL'
            ? 'В выбранном периоде нет квитанций с таким статусом.'
            : `За ${selectedMonth === 'ALL' ? 'весь период' : 'выбранный месяц'} квитанций на ремонт нет.`}
        </p>

        {(searchQuery || statusFilter !== 'ALL') && (
          <div className="mt-4 flex items-center gap-2 flex-wrap justify-center">
            {searchQuery && (
              <Button
                variant="secondary"
                size="md"
                className="!h-8.5 !px-3 text-xs"
                onClick={() => setSearchQuery('')}
              >
                <X className="w-3.5 h-3.5 mr-1 text-fg-subtle" />
                Сбросить поиск
              </Button>
            )}
            {statusFilter !== 'ALL' && (
              <Button
                variant="secondary"
                size="md"
                className="!h-8.5 !px-3 text-xs"
                onClick={() => setStatusFilter('ALL')}
              >
                Показать все статусы
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
      {filteredRepairs.map((ticket: RepairTicket) => (
        <RepairTicketCard
          key={ticket.id}
          ticket={ticket}
          isStoreScoped={isStoreScoped}
          updatingTicketId={updatingTicketId}
          onViewTicket={onViewTicket}
          onUpdateStatusQuick={onUpdateStatusQuick}
          onOpenIssueModal={onOpenIssueModal}
        />
      ))}
    </div>
  );
};
