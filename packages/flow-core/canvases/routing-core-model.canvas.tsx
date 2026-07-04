import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  CollapsibleSection,
  computeDAGLayout,
  Grid,
  H1,
  Pill,
  Row,
  Stack,
  Swatch,
  Table,
  Text,
  useCanvasState,
  useHostTheme,
  type Color,
} from "cursor/canvas";

type View = "model" | "flow" | "guards";

const modelNodes = [
  { id: "topic", label: "Topic", sub: "Anliegen", layer: "Stammdaten" },
  { id: "routingRule", label: "RoutingRule", sub: "Startentscheidung", layer: "Stammdaten" },
  { id: "location", label: "Location", sub: "Physischer Ort", layer: "Stammdaten" },
  { id: "queue", label: "Queue", sub: "Arbeitsliste", layer: "Stammdaten" },
  { id: "surface", label: "Surface", sub: "Terminal / Panel / TV", layer: "Anzeige" },
  { id: "displayRule", label: "SurfaceDisplayRule", sub: "Filter pro Surface", layer: "Anzeige" },
  { id: "visit", label: "Visit", sub: "Operative Wahrheit", layer: "Laufzeit" },
  { id: "events", label: "visit_events", sub: "Audit / Historie", layer: "Laufzeit" },
];

const modelEdges = [
  { from: "topic", to: "routingRule", label: "topicId" },
  { from: "routingRule", to: "location", label: "initial*LocationId" },
  { from: "routingRule", to: "queue", label: "initialQueueId" },
  { from: "location", to: "queue", label: "homeLocationId" },
  { from: "routingRule", to: "visit", label: "appliedRoutingRuleId" },
  { from: "queue", to: "visit", label: "queueId" },
  { from: "location", to: "visit", label: "lastKnown / target" },
  { from: "visit", to: "events", label: "1:n" },
  { from: "surface", to: "displayRule", label: "surfaceId" },
  { from: "displayRule", to: "visit", label: "filtert Sichtbarkeit" },
];

const statusFlow = [
  { id: "checkin", label: "Check-in / Redirect", status: "waiting", note: "call, pickup" },
  { id: "directed", label: "Check-in / Redirect", status: "directed", note: "nur self_go" },
  { id: "called", label: "MFA: Aufrufen", status: "called", note: "movementMode = call" },
  { id: "arrived", label: "MFA: Ankunft", status: "arrived", note: "+ Queue-Handoff" },
  { id: "progress", label: "MFA: Start", status: "in_progress", note: "" },
  { id: "done", label: "MFA: Fertig", status: "done", note: "" },
];

const guards = [
  {
    name: "Topic + Rule vorhanden",
    module: "runtime.mjs · checkIn",
    type: "hard",
    effect: "Ohne aktives Topic/Rule kein Check-in",
  },
  {
    name: "Terminal-Scope",
    module: "routing-scope.mjs",
    type: "hard",
    effect: "Rule nur an erlaubten Terminals (allowedSurfaceIds)",
  },
  {
    name: "Escort → pickup",
    module: "escort.mjs",
    type: "soft",
    effect: "self_go wird zu pickup wenn Begleitung nötig",
  },
  {
    name: "Status-Transition Guards",
    module: "visit-flow.mjs · assertTransitionAllowed",
    type: "hard",
    effect: "call ← waiting/directed; arrive ← called; start ← arrived; done ← in_progress",
  },
  {
    name: "Status aus movementMode",
    module: "visit-flow.mjs · statusForMovementMode",
    type: "soft",
    effect: "self_go → directed, sonst → waiting",
  },
  {
    name: "Call nur bei call",
    module: "runtime.mjs · transition",
    type: "hard",
    effect: "Aufrufen blockiert wenn movementMode ≠ call",
  },
  {
    name: "Redirect → waiting",
    module: "runtime.mjs · redirect",
    type: "soft",
    effect: "Bei call/pickup/stay: Status zurück auf waiting (neu warten)",
  },
  {
    name: "allowRedirect",
    module: "runtime.mjs · redirect",
    type: "hard",
    effect: "Redirect blockiert wenn Visit.allowRedirect = false (Default true)",
  },
  {
    name: "self_go + Escort blockiert",
    module: "runtime.mjs · redirect",
    type: "hard",
    effect: "SELF_GO_BLOCKED_BY_ESCORT_POLICY",
  },
  {
    name: "Queue-Handoff bei Ankunft",
    module: "location-routing.mjs",
    type: "soft",
    effect: "Queue-Wechsel nur bei arrive, nicht bei call",
  },
  {
    name: "WZ-TV Ort + Display",
    module: "surface-visibility.mjs",
    type: "soft",
    effect: "lastKnown = Surface-Ort; publicDisplayMode filtert TV",
  },
  {
    name: "Route nur bei called",
    module: "app.js · surfaceRouteLabel",
    type: "soft",
    effect: "Wartezimmer → Ziel nur nach explizitem Aufruf",
  },
];

const layerColors: Record<string, Color> = {
  Stammdaten: "blue",
  Anzeige: "purple",
  Laufzeit: "green",
};

function ModelDiagram() {
  const theme = useHostTheme();
  const layout = computeDAGLayout({
    nodes: modelNodes.map((n) => ({ id: n.id })),
    edges: modelEdges.map((e) => ({ from: e.from, to: e.to })),
    direction: "vertical",
    nodeWidth: 168,
    nodeHeight: 52,
    rankGap: 72,
    nodeGap: 32,
    padding: 28,
  });

  const nodeById = Object.fromEntries(modelNodes.map((n) => [n.id, n]));

  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        width={layout.width}
        height={layout.height}
        role="img"
        aria-label="Routing Core Datenmodell — Entitäten und Beziehungen"
        style={{ display: "block", minWidth: layout.width }}
      >
        {layout.ranks.map((rank) => (
          <rect
            key={rank.rank}
            x={rank.x - 8}
            y={rank.y - 8}
            width={rank.width + 16}
            height={rank.height + 16}
            rx={8}
            fill={theme.fill.quaternary}
            stroke={theme.stroke.tertiary}
            strokeWidth={1}
          />
        ))}

        {layout.edges.map((edge) => {
          const midY = (edge.sourceY + edge.targetY) / 2;
          const path = edge.isBackEdge
            ? `M ${edge.sourceX} ${edge.sourceY} C ${edge.sourceX + 80} ${edge.sourceY} ${edge.targetX + 80} ${edge.targetY} ${edge.targetX} ${edge.targetY}`
            : `M ${edge.sourceX} ${edge.sourceY} C ${edge.sourceX} ${midY} ${edge.targetX} ${midY} ${edge.targetX} ${edge.targetY}`;
          return (
            <path
              key={`${edge.from}-${edge.to}`}
              d={path}
              fill="none"
              stroke={edge.isBackEdge ? theme.text.tertiary : theme.stroke.secondary}
              strokeWidth={1.5}
              strokeDasharray={edge.isBackEdge ? "4 3" : undefined}
              markerEnd="url(#arrow)"
            />
          );
        })}

        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill={theme.stroke.secondary} />
          </marker>
        </defs>

        {layout.nodes.map((node) => {
          const meta = nodeById[node.id];
          const color = layerColors[meta.layer] ?? "blue";
          return (
            <g key={node.id}>
              <rect
                x={node.x}
                y={node.y}
                width={168}
                height={52}
                rx={6}
                fill={theme.bg.elevated}
                stroke={theme.stroke.primary}
                strokeWidth={1}
              />
              <circle cx={node.x + 14} cy={node.y + 16} r={5} fill={theme.category[color]} />
              <text x={node.x + 26} y={node.y + 20} fill={theme.text.primary} fontSize={12} fontWeight={600}>
                {meta.label}
              </text>
              <text x={node.x + 12} y={node.y + 38} fill={theme.text.secondary} fontSize={10}>
                {meta.sub}
              </text>
            </g>
          );
        })}
      </svg>
      <Text size="small" tone="tertiary">
        Quelle: db/schema.sql · PoC new_flow_core · gestrichelte Kanten = Rückbezüge / Filter
      </Text>
    </div>
  );
}

function StatusFlowDiagram() {
  const theme = useHostTheme();
  const boxW = 118;
  const boxH = 44;
  const gap = 24;
  const startX = 24;
  const yMain = 48;
  const yAlt = 118;

  const mainPath = ["checkin", "called", "arrived", "progress", "done"];
  const alt = statusFlow.find((s) => s.id === "directed");

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={680} height={190} role="img" aria-label="Visit Statusfluss bei movementMode call">
        <text x={24} y={20} fill={theme.text.secondary} fontSize={11}>
          Pfad bei movementMode = call (Redirect setzt zurück auf waiting)
        </text>

        {mainPath.map((id, i) => {
          const step = statusFlow.find((s) => s.id === id)!;
          const x = startX + i * (boxW + gap);
          return (
            <g key={id}>
              {i > 0 && (
                <line
                  x1={x - gap}
                  y1={yMain + boxH / 2}
                  x2={x}
                  y2={yMain + boxH / 2}
                  stroke={theme.stroke.secondary}
                  strokeWidth={1.5}
                  markerEnd="url(#flowArrow)"
                />
              )}
              <rect
                x={x}
                y={yMain}
                width={boxW}
                height={boxH}
                rx={6}
                fill={step.status === "called" ? theme.fill.primary : theme.bg.elevated}
                stroke={step.status === "called" ? theme.accent.primary : theme.stroke.primary}
                strokeWidth={1}
              />
              <text x={x + 10} y={yMain + 18} fill={theme.text.primary} fontSize={11} fontWeight={600}>
                {step.status}
              </text>
              <text x={x + 10} y={yMain + 34} fill={theme.text.tertiary} fontSize={9}>
                {step.label}
              </text>
            </g>
          );
        })}

        <line
          x1={startX + boxW / 2}
          y1={yMain + boxH}
          x2={startX + boxW / 2}
          y2={yAlt - 8}
          stroke={theme.stroke.tertiary}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text x={startX + boxW + 8} y={yAlt + 14} fill={theme.text.tertiary} fontSize={10}>
          Alternativ: self_go
        </text>
        <rect
          x={startX}
          y={yAlt}
          width={boxW}
          height={boxH}
          rx={6}
          fill={theme.bg.elevated}
          stroke={theme.stroke.primary}
          strokeWidth={1}
        />
        <text x={startX + 10} y={yAlt + 18} fill={theme.text.primary} fontSize={11} fontWeight={600}>
          {alt?.status}
        </text>
        <text x={startX + 10} y={yAlt + 34} fill={theme.text.tertiary} fontSize={9}>
          {alt?.label}
        </text>

        <rect
          x={startX + boxW + gap + 40}
          y={yAlt - 4}
          width={280}
          height={52}
          rx={6}
          fill={theme.fill.quaternary}
          stroke={theme.stroke.tertiary}
          strokeWidth={1}
        />
        <text x={startX + boxW + gap + 52} y={yAlt + 14} fill={theme.text.secondary} fontSize={10}>
          Redirect nach called → waiting
        </text>
        <text x={startX + boxW + gap + 52} y={yAlt + 30} fill={theme.text.tertiary} fontSize={9}>
          Neuer Queue/Ort → erneut aufrufen nötig (runtime.mjs)
        </text>

        <defs>
          <marker id="flowArrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill={theme.stroke.secondary} />
          </marker>
        </defs>
      </svg>
    </div>
  );
}

function GuardsTable() {
  return (
    <Table
      headers={["Guard", "Modul", "Typ", "Wirkung"]}
      rows={guards.map((g) => [
        g.name,
        g.module,
        g.type === "hard" ? (
          <Pill tone="warning" size="sm">
            hard
          </Pill>
        ) : (
          <Pill tone="info" size="sm">
            soft
          </Pill>
        ),
        g.effect,
      ])}
    />
  );
}

export default function RoutingCoreModelCanvas() {
  const [view, setView] = useCanvasState<View>("view", "model");

  return (
    <Stack gap={16} style={{ padding: 16, maxWidth: 920 }}>
      <Stack gap={6}>
        <H1>Routing Core — Modell & Guards</H1>
        <Text tone="secondary">
          PoC-Datenmodell mit Runtime-Guards. RoutingRule = Start; Visit = operative Wahrheit; Guards sitzen in
          Runtime-Funktionen, nicht im DB-Schema.
        </Text>
      </Stack>

      <Row gap={8} wrap>
        <Button variant={view === "model" ? "primary" : "ghost"} onClick={() => setView("model")}>
          Datenmodell
        </Button>
        <Button variant={view === "flow" ? "primary" : "ghost"} onClick={() => setView("flow")}>
          Statusfluss
        </Button>
        <Button variant={view === "guards" ? "primary" : "ghost"} onClick={() => setView("guards")}>
          Guards
        </Button>
      </Row>

      {view === "model" && (
        <Stack gap={12}>
          <Card>
            <CardHeader trailing={<Text size="small" tone="tertiary">schema.sql · FK-Graph</Text>}>
              Entitäten & Beziehungen
            </CardHeader>
            <CardBody>
              <ModelDiagram />
            </CardBody>
          </Card>

          <Grid columns={3} gap={12}>
            <Card>
              <CardHeader trailing={<Swatch color="blue" />}>Stammdaten</CardHeader>
              <CardBody>
                <Text size="small">Topic, Location, Queue, RoutingRule — konfigurierbar, ändern laufende Visits nicht retroaktiv.</Text>
              </CardBody>
            </Card>
            <Card>
              <CardHeader trailing={<Swatch color="purple" />}>Anzeige</CardHeader>
              <CardBody>
                <Text size="small">Surface + SurfaceDisplayRule filtern, wer wo sichtbar ist. publicDisplayMode nur für WZ-TV.</Text>
              </CardBody>
            </Card>
            <Card>
              <CardHeader trailing={<Swatch color="green" />}>Laufzeit</CardHeader>
              <CardBody>
                <Text size="small">Visit trägt status, queueId, target, lastKnown, movementMode. visit_events = Audit.</Text>
              </CardBody>
            </Card>
          </Grid>

          <CollapsibleSection title="Visit-Felder (operative Wahrheit)" count={6} defaultOpen>
            <Table
              headers={["Feld", "Rolle"]}
              rows={[
                ["status", "Aktueller Prozessschritt (waiting, called, …)"],
                ["queueId", "Aktuelle Arbeitsliste"],
                ["targetLocationId", "Wohin als Nächstes"],
                ["lastKnownLocationId", "Wo gilt der Patient (bis Ankunft bestätigt)"],
                ["movementMode", "Wie weiter: call, self_go, pickup"],
                ["publicDisplayMode", "Sichtbarkeit am Wartezimmer-TV"],
              ]}
            />
          </CollapsibleSection>
        </Stack>
      )}

      {view === "flow" && (
        <Stack gap={12}>
          <Card>
            <CardHeader trailing={<Text size="small" tone="tertiary">runtime.mjs · transition + redirect</Text>}>
              Visit Status Machine
            </CardHeader>
            <CardBody>
              <StatusFlowDiagram />
            </CardBody>
          </Card>

          <Callout tone="info" title="Redirect-Regel">
            Bei movementMode call/pickup setzt redirect() den Status immer auf waiting — auch wenn der
            Patient gerade called war. Das ist Modelllogik: neuer Queue/Ort = neue Wartesituation.
          </Callout>

          <Grid columns={2} gap={12}>
            <Card>
              <CardHeader>Check-in</CardHeader>
              <CardBody>
                <Stack gap={4}>
                  <Text size="small">
                    <strong>1.</strong> Topic + Rule auflösen
                  </Text>
                  <Text size="small">
                    <strong>2.</strong> Escort/Assist anwenden (escort.mjs)
                  </Text>
                  <Text size="small">
                    <strong>3.</strong> Visit + Events checked_in / routed
                  </Text>
                </Stack>
              </CardBody>
            </Card>
            <Card>
              <CardHeader>Redirect</CardHeader>
              <CardBody>
                <Stack gap={4}>
                  <Text size="small">Überschreibt queueId, target, movementMode</Text>
                  <Text size="small">lastKnown bleibt bis arrive unverändert</Text>
                  <Text size="small">Rule selbst wird nicht geändert</Text>
                </Stack>
              </CardBody>
            </Card>
          </Grid>
        </Stack>
      )}

      {view === "guards" && (
        <Stack gap={12}>
          <Row gap={16}>
            <Card style={{ flex: 1 }}>
              <CardHeader trailing={<Pill tone="warning" size="sm">API Error</Pill>}>Hard Guards</CardHeader>
              <CardBody>
                <Text size="small">Blockieren die Aktion — z. B. Call ohne call-Mode, self_go bei Pflicht-Begleitung.</Text>
              </CardBody>
            </Card>
            <Card style={{ flex: 1 }}>
              <CardHeader trailing={<Pill tone="info" size="sm">Filter / Regel</Pill>}>Soft Guards</CardHeader>
              <CardBody>
                <Text size="small">Steuern Verhalten ohne Fehler — Anzeige, Queue-Handoff, Status-Neusetzung bei Redirect.</Text>
              </CardBody>
            </Card>
          </Row>

          <Card>
            <CardHeader trailing={<Text size="small" tone="tertiary">Runtime-Module im PoC</Text>}>
              Guard-Übersicht
            </CardHeader>
            <CardBody style={{ padding: 0 }}>
              <GuardsTable />
            </CardBody>
          </Card>

          <CollapsibleSection title="Bewusst nicht im PoC" count={3}>
            <Stack gap={6}>
              <Text size="small">• Kein zentraler Transition-Validator</Text>
              <Text size="small">• Keine Rollen / Auth</Text>
              <Text size="small">• Keine PVS-Anbindung</Text>
            </Stack>
          </CollapsibleSection>
        </Stack>
      )}
    </Stack>
  );
}
