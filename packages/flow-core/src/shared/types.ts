export type ActiveVisitStatus =
  | 'waiting'
  | 'directed'
  | 'called'
  | 'arrived'
  | 'in_progress';

/** Fachlich abgeschlossen — siehe visit-flow.TERMINAL_VISIT_STATUSES. */
export type TerminalVisitStatus = 'done' | 'cancelled' | 'no_show';

/** Nicht terminal — ACTIVE + blocked; siehe visit-flow.OPEN_VISIT_STATUSES. */
export type OpenVisitStatus = ActiveVisitStatus | 'blocked';

/** Reserviert / Event-only — nicht in Runtime-Transitions genutzt. */
export type ReservedVisitStatus =
  | 'created'
  | 'checked_in';

export type VisitStatus = ActiveVisitStatus | TerminalVisitStatus | OpenVisitStatus | ReservedVisitStatus;

export type MovementMode = 'self_go' | 'call' | 'pickup';
export type EscortPolicy = 'none' | 'recommended' | 'required';
export type LocationConfidence = 'instructed' | 'assumed' | 'confirmed';
/** Sichtbarkeit auf public_display-Surfaces (z. B. Wartezimmer-TV). Staff-Panels nutzen nur SurfaceDisplayRule. */
export type PublicDisplayMode = 'visible' | 'hidden' | 'call_only';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type CheckInPath = 'topic' | 'mfa_assist';
/** `none` = direkte persoenliche Anmeldung ohne vorgelagerte Terminal-Identifikation. */
export type AuthPath = 'phone_dob' | 'name_dob' | 'egk' | 'none';

export interface Topic {
  id: string;
  name: string;
  category: string;
  color: string;
  defaultPriority: Priority;
  estimatedDurationMin?: number;
  active: boolean;
  sortOrder: number;
  laneCode: string;
}

export interface Location {
  id: string;
  name: string;
  type: 'entrance' | 'waiting_area' | 'reception' | 'treatment_room' | 'lab' | 'service_station' | 'virtual';
  canWait: boolean;
  canTreat: boolean;
  canCheckIn: boolean;
  staffOnly: boolean;
  publicName?: string;
  active: boolean;
  sortOrder: number;
}

export interface Queue {
  id: string;
  name: string;
  homeLocationId?: string;
  type: 'location' | 'service' | 'reception' | 'assistance' | 'virtual';
  sortPolicy: 'checkin_time' | 'priority_then_time' | 'manual';
  callPolicy: 'manual' | 'automatic' | 'none';
  defaultMovementMode: MovementMode;
  active: boolean;
  sortOrder: number;
}

/**
 * Bedien- oder Anzeigeoberflaeche an einer Location.
 * Terminals (`type: 'terminal'`) werden spaeter in Settings frei angelegt und
 * einer Location zugeordnet; Check-in speichert die gewaehlte Surface als `lastSurfaceId`.
 */
export interface Surface {
  id: string;
  locationId: string;
  name: string;
  type: 'terminal' | 'public_display' | 'staff_panel' | 'dashboard';
  audience: 'patient' | 'staff' | 'public';
  showsQueue: boolean;
  supportsCalling: boolean;
  supportsConfirmation: boolean;
  supportsRedirect: boolean;
  enabled: boolean;
}

export interface SurfaceDisplayRule {
  id: string;
  surfaceId: string;
  queueId?: string;
  locationId?: string;
  topicId?: string;
  displayMode: PublicDisplayMode;
  /** Niedriger = hoehere Prioritaet bei gleicher Spezifitaet. */
  sortOrder: number;
}

/** Journey-Templates — Domain-Typen der exportierbaren Journey-Komponente (`journey.ts`). */
export type JourneyCompletedWhen = 'arrive' | 'start' | 'done';

/** Laufzeitstatus der Journey auf dem Visit — unabhängig von journeyStepIndex. */
export type JourneyState = 'active' | 'completed' | 'abandoned';

/** Redirect: wie sich lastKnownLocationId und locationConfidence verhalten. */
export type RedirectLocationSemantics = 'instructed' | 'confirmed' | 'unknown';

export interface JourneyTemplate {
  id: string;
  name: string;
  topicId?: string;
  active: boolean;
}

export interface JourneyStep {
  id: string;
  templateId: string;
  sortOrder: number;
  targetLocationId?: string;
  queueId?: string;
  movementMode: MovementMode;
  publicDisplayMode: PublicDisplayMode;
  completedWhen: JourneyCompletedWhen;
  /** Optionaler Hop-Hinweis; leer = Default aus movementMode + Ziel. */
  instructionText?: string;
}

export interface RoutingRule {
  id: string;
  topicId: string;
  name: string;
  /** Nur bei single_step (ohne journeyTemplateId). Bei Journey ignoriert — Route kommt aus Journey-Steps. */
  initialLastKnownLocationId?: string;
  initialTargetLocationId?: string;
  initialQueueId?: string;
  initialMovementMode: MovementMode;
  initialLocationConfidence: LocationConfidence;
  /** Nur single_step — bei Journey pro Step in journey_steps.public_display_mode */
  publicDisplayMode: PublicDisplayMode;
  /** Nur single_step — bei Journey terminalInstruction aus movementMode */
  terminalInstructionTemplate: string;
  /** PoC: FUTURE — Schließanlage/Gate; ungenutzt, nicht in Admin-UI. */
  requiresReceptionConfirmation: boolean;
  escortPolicy: EscortPolicy;
  allowRedirect: boolean;
  /** null/leer = alle Terminals; sonst nur diese Surface-IDs duerfen das Topic anbieten */
  allowedSurfaceIds?: string[];
  /** Gesetzt = Journey ersetzt operative Route vollstaendig; initial_* wird ignoriert */
  journeyTemplateId?: string;
  active: boolean;
}

export interface Patient {
  id: string;
  displayName?: string;
  isAnonymous: boolean;
  createdAt: string;
}

export type QueueNumberScope = 'lane_day';

export interface Visit {
  id: string;
  patientId: string;
  patientDisplayName?: string;
  status: VisitStatus;
  primaryTopicId?: string;
  appliedRoutingRuleId?: string;
  lastKnownLocationId?: string;
  targetLocationId?: string;
  queueId?: string;
  /** Surface des letzten Check-ins (z.B. Terminal); Location ergibt sich ueber Surface.locationId */
  lastSurfaceId?: string;
  movementMode: MovementMode;
  locationConfidence: LocationConfidence;
  /** Nur fuer Surfaces mit type public_display; Staff-Panels ignorieren dieses Feld. */
  publicDisplayMode: PublicDisplayMode;
  queueNumber: string;
  queueNumberDate: string;
  queueNumberScope: QueueNumberScope;
  queueLaneCode: string;
  queueSequence: number;
  /** MFA-Markierung: Patient braucht Begleitung — aendert Routing nicht. */
  needsAssistance: boolean;
  /** topic = Standard-Check-in; mfa_assist = interner Assist-/Empfangs-Pfad. */
  checkInPath: CheckInPath;
  /** Terminal-Anmeldeweg — unabhaengig vom Routing-Kontext; `none` = ohne Identifikation. */
  authPath: AuthPath;
  configuredEscortPolicy: EscortPolicy;
  effectiveEscortPolicy: EscortPolicy;
  allowRedirect: boolean;
  /** Aktueller Hinweis fuer den naechsten operativen Hop (alias: currentInstruction). Nicht der Check-in-Originaltext. */
  terminalInstruction: string;
  staffNote?: string;
  checkedInAt?: string;
  calledAt?: string;
  arrivedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  /** Aktive Journey-Vorlage; null = kein Autopilot */
  journeyTemplateId?: string;
  /** Index in journey_steps; null wenn Hop-Cursor beendet — Endzustand siehe journeyState. */
  journeyStepIndex?: number;
  /** active | completed | abandoned; fehlt wenn keine Journey. */
  journeyState?: JourneyState;
  /** Vorgänger-Visit bei Topic-Supersede (1:1-Kette). */
  supersedesVisitId?: string;
  /** Nachfolger-Visit wenn dieses Visit supersedet wurde. */
  supersededByVisitId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VisitEvent {
  id: string;
  visitId: string;
  type: 'checked_in' | 'routed' | 'called' | 'arrived' | 'started' | 'returned_to_waiting' | 'redirected' | 'journey_completed' | 'journey_abandoned' | 'blocked' | 'done' | 'cancelled' | 'no_show' | 'superseded';
  fromStatus?: string;
  toStatus?: string;
  fromLocationId?: string;
  toLocationId?: string;
  fromQueueId?: string;
  toQueueId?: string;
  actorType: 'terminal' | 'mfa' | 'doctor' | 'system';
  actorId?: string;
  note?: string;
  correlationId?: string;
  createdAt: string;
}

export interface Catalog {
  topics: Topic[];
  locations: Location[];
  queues: Queue[];
  surfaces: Surface[];
  surfaceDisplayRules: SurfaceDisplayRule[];
  routingRules: RoutingRule[];
  journeyTemplates: JourneyTemplate[];
  journeySteps: JourneyStep[];
}

export interface VisitView extends Visit {
  topic?: Topic;
  queue?: Queue;
  lastKnownLocation?: Location;
  targetLocation?: Location;
  journeyTemplate?: JourneyTemplate;
  journeyStepLabel?: string;
}
