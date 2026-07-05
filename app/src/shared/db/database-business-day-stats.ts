import type { StatementSync } from 'node:sqlite';
import type { BusinessDayVisitStats, TicketStatus } from './db-types.js';

type BusinessDayStatsStatements = {
  countVisitsByBusinessDayStmt: StatementSync;
  maxWaitMsByBusinessDayStmt: StatementSync;
  topicCountsByBusinessDayStmt: StatementSync;
  listOpenVisitsByBusinessDayStmt: StatementSync;
};

export function getBusinessDayVisitStatsFromDb(
  deps: BusinessDayStatsStatements,
  businessDay: string,
): BusinessDayVisitStats {
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
  const openVisitRows = deps.listOpenVisitsByBusinessDayStmt.all(businessDay) as Array<{
    visitId?: string;
    laneCode?: string;
    number?: number;
    topicLabel?: string;
    identityRef?: string | null;
    status?: TicketStatus;
  }>;

  return {
    businessDay,
    totalVisits: totalRow?.count ?? 0,
    maxWaitMs: maxWaitRow?.maxWaitMs ?? 0,
    byTopic: topicRows.map((row) => ({
      topicId: row.topicId ?? '',
      topicLabel: row.topicLabel ?? '',
      count: row.count ?? 0,
    })),
    openVisits: openVisitRows
      .filter((row) => row.visitId && row.laneCode && typeof row.number === 'number' && row.status)
      .map((row) => ({
        visitId: row.visitId!,
        laneCode: row.laneCode!,
        number: row.number!,
        topicLabel: row.topicLabel ?? '',
        identityRef: row.identityRef ?? null,
        status: row.status!,
      })),
  };
}

/** @deprecated Use getBusinessDayVisitStatsFromDb */
export const getBusinessDayTicketStatsFromDb = getBusinessDayVisitStatsFromDb;
