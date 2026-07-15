/** Deutsche UI-Labels — geteilt zwischen Browser und PoC-Debug-Pills. */

import type {
  ActiveVisitStatus,
  EscortPolicy,
  JourneyCompletedWhen,
  LocationConfidence,
  MovementMode,
  PublicDisplayMode,
  TerminalVisitStatus,
} from './types.js';

export const movementLabels: Record<MovementMode, string> = {
  self_go: 'geht selbst',
  call: 'aufrufen',
  pickup: 'abholen',
};

export const statusLabels: Record<ActiveVisitStatus | TerminalVisitStatus, string> = {
  waiting: 'wartet',
  directed: 'unterwegs (selbst)',
  called: 'aufgerufen',
  arrived: 'angekommen',
  in_progress: 'in Behandlung',
  done: 'abgeschlossen',
  cancelled: 'abgesagt',
  no_show: 'nicht erschienen',
};

export const displayLabels: Record<PublicDisplayMode, string> = {
  visible: 'sichtbar (public_display)',
  hidden: 'verborgen (public_display)',
  call_only: 'nur beim Aufruf (public_display)',
};

export const escortLabels: Record<EscortPolicy, string> = {
  none: 'keine Begleitung',
  recommended: 'Begleitung empfohlen',
  required: 'Begleitung erforderlich',
};

export const confidenceLabels: Record<LocationConfidence, string> = {
  instructed: 'angewiesen',
  assumed: 'angenommen',
  confirmed: 'bestätigt',
};

export const completedWhenLabels: Record<JourneyCompletedWhen, string> = {
  arrive: 'nach Ankunft',
  start: 'nach Start',
  done: 'nach Abschluss',
};

export const errorLabels: Record<string, string> = {
  NOT_FOUND: 'Ressource nicht gefunden.',
  ROUTING_RULE_NOT_FOUND: 'RoutingRule nicht gefunden.',
  ROUTING_RULE_TOPIC_IMMUTABLE: 'Topic einer RoutingRule kann nicht geändert werden.',
  SURFACE_NOT_FOUND: 'Surface nicht gefunden.',
  INVALID_COMPLETED_WHEN: 'Ungültiger completedWhen-Wert.',
  INVALID_ESCORT_POLICY: 'Ungültige Escort-Policy.',
  INVALID_LOCATION_CONFIDENCE: 'Ungültige locationConfidence.',
  TERMINAL_SURFACE_INVALID: 'Ungültiges Terminal (Surface).',
  LOCATION_INACTIVE_OR_MISSING: 'Location fehlt oder ist inaktiv.',
  QUEUE_INACTIVE_OR_MISSING: 'Queue fehlt oder ist inaktiv.',
  INVALID_REQUEST_BODY: 'Ungültiger Request-Body.',
  INVALID_VISIT_PATCH: 'Ungültiger Visit-Patch (undefined-Werte oder ungültiges supersededByVisitId).',
  INVALID_JSON: 'Ungültiges JSON.',
  REQUEST_BODY_TOO_LARGE: 'Request-Body zu groß.',
  SELF_GO_BLOCKED_BY_ESCORT_POLICY:
    'Alleinlauf blockiert: für diesen Visit ist Begleitung erforderlich.',
  REDIRECT_NOT_ALLOWED: 'Redirect blockiert: allowRedirect ist für diesen Visit false.',
  TOPIC_NOT_ALLOWED_AT_SURFACE: 'Dieses Thema ist an diesem Terminal nicht erlaubt.',
  CALL_ONLY_FOR_CALL_MOVEMENT: 'Aufruf nur bei movementMode = call.',
  CALL_ONLY_FROM_WAITING: 'Aufruf nur aus waiting oder directed.',
  ARRIVE_ONLY_WHEN_CALLED: 'Ankunft nur nach Aufruf (status = called).',
  ARRIVE_ONLY_WHEN_DIRECTED: 'Ankunft nur wenn Patient unterwegs ist (status = directed).',
  ARRIVE_ONLY_WHEN_WAITING: 'Abholung nur aus waiting (pickup).',
  ARRIVE_NOT_ALLOWED: 'Ankunft für diesen movementMode nicht vorgesehen.',
  START_ONLY_WHEN_ARRIVED: 'Start nur nach Ankunft (status = arrived).',
  DONE_ONLY_WHEN_IN_PROGRESS: 'Abschluss nur während Behandlung (status = in_progress).',
  START_NEXT_JOURNEY_STEP_NOT_ALLOWED:
    'Nächster Journey-Schritt kann in diesem Status nicht gestartet werden.',
  VISIT_NOT_FOUND: 'Visit nicht gefunden.',
  TOPIC_OR_ROUTING_RULE_MISSING: 'Topic oder RoutingRule fehlt.',
  CHECKIN_TOPIC_OR_MFA_ASSIST_REQUIRED: 'Check-in braucht ein Thema oder den Hilfe-Button.',
  CHECKIN_MFA_ASSIST_EXCLUSIVE: 'Hilfe-Button schließt Thema und needsAssistance aus.',
  CHECKIN_ASSISTANCE_REQUIRES_TOPIC: 'needsAssistance setzt ein gewähltes Thema voraus.',
  CHECKIN_SURFACE_INVALID: 'Ungültiges Check-in-Terminal.',
  JOURNEY_TEMPLATE_NOT_FOUND: 'Journey-Template nicht gefunden.',
  JOURNEY_TEMPLATE_LOCKED:
    'Diese Journey wurde heute bereits verwendet. Speichern erst nach Tagesende möglich.',
  TOPIC_LOCKED: 'Dieses Thema hat noch offene Patienten. Speichern erst nach Tagesende möglich.',
  VISIT_LOCATION_MISMATCH: 'Aktion gilt nicht für diesen Zielort.',
  INVALID_AUTH_PATH: 'Ungültiger Anmeldeweg.',
  TOPIC_NOT_FOUND: 'Thema nicht gefunden.',
  JOURNEY_STEP_MISSING: 'Journey-Template hat keine Schritte.',
  JOURNEY_STEPS_EMPTY: 'Aktives Journey-Template braucht mindestens einen Schritt.',
  DUPLICATE_ACTIVE_ROUTING_RULE:
    'Mehrere aktive RoutingRules mit überlappendem Terminal-Scope für dasselbe Topic.',
  DUPLICATE_JOURNEY_SORT_ORDER: 'Journey-Schritte haben doppelte sortOrder.',
  JOURNEY_TOPIC_MISMATCH: 'Journey-Template passt nicht zum Topic der RoutingRule.',
  JOURNEY_TEMPLATE_INACTIVE_OR_MISSING: 'Journey-Template fehlt oder ist inaktiv.',
  SURFACE_DISPLAY_RULE_AMBIGUOUS:
    'SurfaceDisplayRules sind mehrdeutig (gleiche Spezifität und sortOrder).',
  INVALID_REDIRECT_LOCATION_SEMANTICS: 'Ungültige locationSemantics für Redirect.',
  REDIRECT_TERMINAL_INSTRUCTION_CONFLICT:
    'terminalInstruction und preserveTerminalInstruction schließen sich aus.',
  REDIRECT_SURFACE_NOT_ALLOWED: 'Redirect von dieser Surface nicht erlaubt.',
  INVALID_MOVEMENT_MODE: 'Ungültiger movementMode.',
  INVALID_PUBLIC_DISPLAY_MODE: 'Ungültiger publicDisplayMode.',
  TOPIC_INACTIVE_OR_MISSING: 'Topic fehlt oder ist inaktiv.',
  TOPIC_NOT_ACTIVE: 'Topic ist nicht aktiv.',
  INVALID_LANE_CODE: 'Ungültiger Nummernkreis (laneCode).',
  RESERVED_LANE_CODE:
    'Nummernkreis M ist in PoC-Seed fuer Hilfe-Check-in reserviert — kein konfigurierbares Thema.',
  UNKNOWN_ACTION: 'Unbekannte Aktion.',
  SUPERSEDE_SOURCE_TERMINAL: 'Abgeschlossene Tickets können nicht umgebucht werden.',
  SUPERSEDE_ALREADY_SUPERSEDED: 'Dieses Ticket wurde bereits umgebucht.',
  SUPERSEDE_SAME_TOPIC: 'Ziel-Thema ist identisch mit dem aktuellen Thema.',
  SUPERSEDE_TOPIC_REQUIRED: 'Ziel-Thema fehlt.',
};
