import type { StatementSync } from 'node:sqlite';
import type { BusinessDayTicketStats, TicketStatus } from './db-types.js';

type BusinessDayStatsStatements = {
  countVisitsByBusinessDayStmt: StatementSync;
  maxWaitMsByBusinessDayStmt: StatementSync;
  topicCountsByBusinessDayStmt: StatementSync;
  listOpenVisitsByBusinessDayStmt: StatementSync;
};

export function getBusinessDayTicketStatsFromDb(
  deps: BusinessDayStatsStatements,
  businessDay: string,
): BusinessDayTicketStats {
  const totalRow = deps.countVisitsByBusinessDayStmt.get(businessDay) as
    | { count?: number }
    | undefined;
  const maxWaitRow = deps.maxWaitMsByBusinessDayStmt.get(businessDay) as
    | { maxWaitMs?: number | null }
    | undefined;
  const topicRows = deps.topicCountsByBusinessDayStmt.all(businessDay) as Array<{
    topicId?: string;
    topicLabel?: string;
    count?: number;
  }>;
  const openTicketRows = deps.listOpenVisitsByBusinessDayStmt.all(businessDay) as Array<{
    ticketId?: string;
    laneCode?: string;
    number?: number;
    topicLabel?: string;
    identityRef?: string | null;
    status?: TicketStatus;
  }>;

  return {
    businessDay,
    totalTickets: totalRow?.count ?? 0,
    maxWaitMs: maxWaitRow?.maxWaitMs ?? 0,
    byTopic: topicRows.map((row) => ({
      topicId: row.topicId ?? '',
      topicLabel: row.topicLabel ?? '',
      count: row.count ?? 0,
    })),
    openTickets: openTicketRows
      .filter((row) => row.ticketId && row.laneCode && typeof row.number === 'number' && row.status)
      .map((row) => ({
        ticketId: row.ticketId!,
        laneCode: row.laneCode!,
        number: row.number!,
        topicLabel: row.topicLabel ?? '',
        identityRef: row.identityRef ?? null,
        status: row.status!,
      })),
  };
}
