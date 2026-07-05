import type { StatementSync } from 'node:sqlite';
import { settingsFromOpsRow } from '../contacts/contact-lookup-config.js';
import { lookupIdentityRefByPhoneFromContactLookup } from '../contacts/contact-lookup-runtime.js';
import { canonicalizePhone, phonesMatch } from '../phone/canonicalize-phone.js';
import type { AbsenceMode, OpsSettings, QueueDisplayStatus } from '../db/db-types.js';
import { parseTicketCode } from './ticket-code.js';
import { domainError } from '../errors/domain-error.js';

export type AbsenceLookupTicketRow = {
  id: string;
  laneCode: string;
  number: number;
  status: QueueDisplayStatus;
  identityRef: string | null;
  callbackPhone: string | null;
  checkinPhone: string | null;
};

export type MarkAbsenceLookupInput = {
  phoneNumber?: string;
  ticketCode?: string;
  mode?: AbsenceMode;
};

export type MarkAbsenceLookupDeps = {
  getBusinessDay: () => string;
  getOpsSettings: () => OpsSettings;
  findTicketByCodeStmt: StatementSync;
  listAbsenceLookupTicketsStmt: StatementSync;
};

const ABSENCE_ELIGIBLE: QueueDisplayStatus[] = ['waiting', 'called'];

function listAbsenceLookupTickets(deps: MarkAbsenceLookupDeps): AbsenceLookupTicketRow[] {
  const rows = deps.listAbsenceLookupTicketsStmt.all(deps.getBusinessDay()) as Array<{
    id?: string;
    laneCode?: string;
    number?: number;
    status?: string;
    identityRef?: string | null;
    callbackPhone?: string | null;
    checkinPhone?: string | null;
  }>;

  return rows
    .filter(
      (row): row is AbsenceLookupTicketRow =>
        typeof row.id === 'string' &&
        typeof row.laneCode === 'string' &&
        typeof row.number === 'number' &&
        typeof row.status === 'string' &&
        ABSENCE_ELIGIBLE.includes(row.status as QueueDisplayStatus),
    )
    .map((row) => ({
      id: row.id,
      laneCode: row.laneCode,
      number: row.number,
      status: row.status as QueueDisplayStatus,
      identityRef: row.identityRef ?? null,
      callbackPhone: row.callbackPhone ?? null,
      checkinPhone: row.checkinPhone ?? null,
    }));
}

function findByTicketCode(
  deps: MarkAbsenceLookupDeps,
  ticketCode: string,
): AbsenceLookupTicketRow | null {
  const parsed = parseTicketCode(ticketCode);
  if (!parsed) {
    throw domainError('INVALID_TICKET_CODE');
  }

  const row = deps.findTicketByCodeStmt.get(
    deps.getBusinessDay(),
    parsed.laneCode,
    parsed.number,
  ) as
    | {
        id?: string;
        status?: string;
      }
    | undefined;

  if (!row?.id || !row.status || !ABSENCE_ELIGIBLE.includes(row.status as QueueDisplayStatus)) {
    return null;
  }

  return {
    id: row.id,
    laneCode: parsed.laneCode,
    number: parsed.number,
    status: row.status as QueueDisplayStatus,
    identityRef: null,
    callbackPhone: null,
    checkinPhone: null,
  };
}

async function findByPhoneNumber(
  deps: MarkAbsenceLookupDeps,
  phoneNumber: string,
): Promise<AbsenceLookupTicketRow[]> {
  const normalizedPhone = canonicalizePhone(phoneNumber);
  if (!normalizedPhone) {
    throw domainError('INVALID_ARGUMENT');
  }

  const tickets = listAbsenceLookupTickets(deps);
  const matches = new Map<string, AbsenceLookupTicketRow>();

  for (const ticket of tickets) {
    if (ticket.callbackPhone && phonesMatch(ticket.callbackPhone, normalizedPhone)) {
      matches.set(ticket.id, ticket);
    }
    if (ticket.checkinPhone && phonesMatch(ticket.checkinPhone, normalizedPhone)) {
      matches.set(ticket.id, ticket);
    }
  }

  const settings = deps.getOpsSettings();
  const lookupSettings = settingsFromOpsRow(settings);
  if (lookupSettings) {
    try {
      const identityRef = await lookupIdentityRefByPhoneFromContactLookup(
        lookupSettings,
        phoneNumber,
      );

      if (identityRef) {
        for (const ticket of tickets) {
          if (ticket.identityRef === identityRef) {
            matches.set(ticket.id, ticket);
          }
        }
      }
    } catch {
      // CSV lookup optional — callback_phone matches still apply.
    }
  }

  return [...matches.values()];
}

export async function resolveMarkAbsenceTicket(
  deps: MarkAbsenceLookupDeps,
  input: MarkAbsenceLookupInput,
): Promise<AbsenceLookupTicketRow> {
  const phoneNumber = input.phoneNumber?.trim() ?? '';
  const ticketCode = input.ticketCode?.trim() ?? '';

  if (!phoneNumber && !ticketCode) {
    throw domainError('TICKET_LOOKUP_REQUIRED');
  }

  if (phoneNumber) {
    const phoneMatches = await findByPhoneNumber(deps, phoneNumber);
    if (phoneMatches.length === 1) {
      return phoneMatches[0];
    }
    if (phoneMatches.length > 1) {
      throw domainError('TICKET_AMBIGUOUS');
    }
    if (!ticketCode) {
      throw domainError('TICKET_CODE_REQUIRED');
    }
  }

  const byCode = findByTicketCode(deps, ticketCode);
  if (!byCode) {
    throw domainError('VISIT_NOT_FOUND');
  }

  return byCode;
}
