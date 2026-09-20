import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Panel, SeverityBadge, Shell, Stat } from "@/components/rq";
import { PerceptionPanel } from "@/components/vision";
import {
  KIND_LABEL,
  SEVERITY_LABEL,
  TRAFFIC_LABEL,
  TYPE_LABEL,
  ZONES,
  classify,
  nearestZone,
  predictTransport,
  simulate,
  trafficFromVision,
  type Coords,
  type EmergencyReport,
  type EmergencyType,
  type Severity,
  type TrafficCondition,
} from "@/lib/decision-twin";
import type { SceneAnalysis, TrafficAnalysis } from "@/lib/vision.functions";
import { createIncident, dispatchIncident } from "@/lib/incident-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ResQAlert — Photo-to-dispatch emergency AI" },
      {
        name: "description",
        content:
          "Upload an accident photo and a traffic camera frame: ResQAlert predicts severity, reads traffic and traffic-police activity, and gives the fastest ambulance-to-hospital ETA.",
      },
      { property: "og:title", content: "ResQAlert — Photo-to-dispatch emergency AI" },
      {
        property: "og:description",
        content:
          "AI severity prediction from an accident photo, traffic-police clearance prediction from camera frames, and DecisionTwin dispatch simulation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportPage,
});

const TYPES: EmergencyType[] = ["medical", "fire", "crime", "accident", "rescue"];
const SEVERITIES: Severity[] = ["low", "moderate", "high", "critical"];
const TRAFFIC: TrafficCondition[] = ["clear", "moderate", "heavy", "gridlock"];

function ReportPage() {
  const navigate = useNavigate();
  const [type, setType] = useState<EmergencyType>("medical");
  const [zoneId, setZoneId] = useState(ZONES[0]!.id);
  const [severity, setSeverity] = useState<Severity>("high");
  const [people, setPeople] = useState(1);
  const [description, setDescription] = useState("Person collapsed at the tram stop, unconscious and not breathing.");
  const [traffic, setTraffic] = useState<TrafficCondition | "auto">("auto");
  const [strategyId, setStrategyId] = useState<string | null>(null);

  const [sceneAI, setSceneAI] = useState<SceneAnalysis | null>(null);
  const [trafficAI, setTrafficAI] = useState<TrafficAnalysis | null>(null);
  const [gps, setGps] = useState<Coords | null>(null);
  const [gpsOffsetKm, setGpsOffsetKm] = useState<number | null>(null);

  const zone = ZONES.find((z) => z.id === zoneId)!;
  const coords = gps ?? zone.coords;

  const report: EmergencyReport = useMemo(
    () => ({ type, description, zoneId, coords, reportedSeverity: severity, peopleAffected: people }),
    [type, description, zoneId, coords, severity, people],
  );

  const preview = classify(report);
  const [result, setResult] = useState<ReturnType<typeof simulate> | null>(null);

  function applyScene(a: SceneAnalysis) {
    setSceneAI(a);
    setType(a.emergencyType);
    setSeverity(a.severity);
    setPeople(Math.max(1, Math.min(20, Math.round(a.peopleAffected))));
    setDescription([a.summary, ...a.visibleSigns, ...a.hazards].join(". "));
  }

  function applyTraffic(a: TrafficAnalysis) {
    setTrafficAI(a);
    setTraffic(trafficFromVision(a.congestionPct));
  }

  function applyLocation(c: Coords) {
    const snapped = nearestZone(c);
    setGps(c);
    setZoneId(snapped.zone.id);
    setGpsOffsetKm(snapped.offsetKm);
  }

  function runSimulation() {
    const r = simulate(report, traffic === "auto" ? undefined : traffic);
    setResult(r);
    setStrategyId(r.recommended.id);
  }

  function authoriseDispatch() {
    if (!result) return;
    const inc = createIncident(report);
    dispatchIncident(inc.id, strategyId ?? result.recommended.id);
    void navigate({ to: "/dispatch" });
  }

  const selected = result?.strategies.find((s) => s.id === strategyId) ?? result?.recommended;

  const transport = useMemo(() => {
    if (!result || !result.hospital || !selected) return null;
    return predictTransport({
      scene: coords,
      hospital: result.hospital,
      traffic: result.traffic,
      sceneEtaMin: selected.etaMin,
      policeClearanceMin: trafficAI?.predictedClearanceMinutes ?? null,
    });
  }, [result, selected, coords, trafficAI]);

  const locationLabel = gps
    ? `GPS ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)} — snapped to ${zone.name} (${gpsOffsetKm} km away)`
    : `No GPS fix — using zone centre ${zone.coords.lat.toFixed(4)}, ${zone.coords.lng.toFixed(4)}`;

  return (
    <Shell>
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Sense → Alert → Model → Simulate → Decide → Dispatch
        </p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Photo-to-dispatch emergency AI</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Upload a photo of the accident and a frame from a nearby traffic camera. The AI predicts severity from the
          scene itself, reads congestion, detects whether a traffic officer is present and actually clearing the road,
          then DecisionTwin simulates the fastest responder and the ambulance&rsquo;s arrival time at hospital.
        </p>
      </div>

      <div className="mb-5">
        <PerceptionPanel
          note={description}
          scene={sceneAI}
          traffic={trafficAI}
          onScene={applyScene}
          onTraffic={applyTraffic}
          onLocation={applyLocation}
          locationLabel={locationLabel}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        {/* ---------------------------------------------------- report form */}
        <Panel step={2} title="Emergency report (AI-filled, editable)">
          <div className="space-y-5">
            <Field label="Emergency type">
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <Chip key={t} active={type === t} onClick={() => setType(t)}>
                    {TYPE_LABEL[t]}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="Location / zone">
              <select
                value={zoneId}
                onChange={(e) => {
                  setZoneId(e.target.value);
                  setGps(null);
                  setGpsOffsetKm(null);
                }}
                className="w-full rounded-lg border border-input bg-surface px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                {ZONES.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} — traffic {TRAFFIC_LABEL[z.baseTraffic].toLowerCase()}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-muted-foreground">{locationLabel}</p>
            </Field>

            <Field label="Reported severity">
              <div className="flex flex-wrap gap-2">
                {SEVERITIES.map((s) => (
                  <Chip key={s} active={severity === s} onClick={() => setSeverity(s)}>
                    {SEVERITY_LABEL[s]}
                  </Chip>
                ))}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`People affected: ${people}`}>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={people}
                  onChange={(e) => setPeople(Number(e.target.value))}
                  className="w-full accent-[var(--primary)]"
                />
              </Field>
              <Field label="Traffic condition">
                <select
                  value={traffic}
                  onChange={(e) => setTraffic(e.target.value as TrafficCondition | "auto")}
                  className="w-full rounded-lg border border-input bg-surface px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="auto">Auto (live zone feed)</option>
                  {TRAFFIC.map((t) => (
                    <option key={t} value={t}>
                      {TRAFFIC_LABEL[t]}
                    </option>
                  ))}
                </select>
                {trafficAI && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Set from the camera: {trafficAI.congestionPct}% congestion
                  </p>
                )}
              </Field>
            </div>

            <Field label="Description">
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-input bg-surface px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="What is happening? Mention injuries, fire, people trapped…"
              />
            </Field>

            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Live classification preview
                </span>
                <SeverityBadge severity={preview.severity} score={preview.score} />
              </div>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {preview.signals.map((s) => (
                  <li key={s}>• {s}</li>
                ))}
                <li>
                  • Required capability: {preview.requiredKinds.map((k) => KIND_LABEL[k]).join(", ")} · target response{" "}
                  {preview.slaMinutes} min
                </li>
              </ul>
            </div>

            <button
              onClick={runSimulation}
              className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Submit report &amp; run DecisionTwin simulation
            </button>
          </div>
        </Panel>

        {/* ------------------------------------------------ simulation out */}
        <div className="space-y-5">
          {!result ? (
            <Panel className="grid min-h-64 place-items-center text-center">
              <div className="max-w-sm">
                <h2 className="text-base font-bold">DecisionTwin idle</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Upload the scene photo and traffic frame, then submit the report to simulate responder ETAs, the
                  traffic-clearance window and the hospital handover time.
                </p>
              </div>
            </Panel>
          ) : (
            <>
              <Panel
                step={3}
                title="Simulation engine output"
                aside={
                  <span className="text-xs text-muted-foreground">
                    {result.scenariosEvaluated} scenarios · {result.decisionMs} ms
                  </span>
                }
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Severity" value={SEVERITY_LABEL[result.classification.severity]} />
                  <Stat label="Priority" value={`P${result.classification.priority}`} />
                  <Stat label="Traffic" value={TRAFFIC_LABEL[result.traffic]} />
                  <Stat label="Target SLA" value={result.classification.slaMinutes} unit="min" />
                </div>

                <h3 className="mt-5 mb-2 text-sm font-bold">Predicted ETA per unit</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="py-1.5 pr-3">Unit</th>
                        <th className="py-1.5 pr-3">Dist</th>
                        <th className="py-1.5 pr-3">Drive</th>
                        <th className="py-1.5 pr-3">Traffic</th>
                        <th className="py-1.5 pr-3">ETA</th>
                        <th className="py-1.5">State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.etas.map((e) => (
                        <tr key={e.responderId} className="border-t border-border">
                          <td className="py-1.5 pr-3 font-medium">{e.responderName}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{e.distanceKm} km</td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{e.driveMin} m</td>
                          <td className="py-1.5 pr-3 text-muted-foreground">+{e.trafficDelayMin} m</td>
                          <td className="py-1.5 pr-3 font-semibold">{e.etaMin} min</td>
                          <td className="py-1.5 text-xs">
                            {e.available ? (
                              <span className="text-[color:var(--success)]">Available</span>
                            ) : (
                              <span className="text-[color:var(--destructive)]">On another call</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel step={4} title="Recommended response strategy">
                <div className="space-y-2.5">
                  {result.strategies.map((s, i) => {
                    const active = s.id === strategyId;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setStrategyId(s.id)}
                        className={`w-full rounded-lg border p-3 text-left transition-colors ${
                          active ? "border-primary bg-accent/60" : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold">
                            {s.label}
                            {i === 0 && (
                              <span className="ml-2 rounded-full bg-success px-2 py-0.5 text-[10px] font-bold uppercase text-success-foreground">
                                Recommended
                              </span>
                            )}
                          </span>
                          <span className="text-sm font-bold">ETA {s.etaMin} min</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {s.rationale} · coverage {s.coveragePct}% · decision score {s.score}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Stat label="Traditional dispatch" value={result.baseline.etaMin} unit="min" />
                  <Stat label="DecisionTwin" value={selected?.etaMin ?? 0} unit="min" />
                  <Stat
                    label="Time saved"
                    value={result.improvementMin > 0 ? `${result.improvementMin}` : "0"}
                    unit={`min (${Math.max(0, result.improvementPct)}%)`}
                    tone={result.improvementMin > 0 ? "text-[color:var(--success)]" : ""}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Baseline: {result.baseline.label} — {result.baseline.unitName}, {result.baseline.distanceKm} km.
                </p>

                <button
                  onClick={authoriseDispatch}
                  className="mt-4 w-full rounded-lg bg-critical px-4 py-3 text-sm font-semibold text-critical-foreground transition-colors hover:opacity-90"
                >
                  Authorise dispatch &amp; open live tracking
                </button>
              </Panel>

              {transport && (
                <Panel step={5} title="Ambulance → hospital ETA">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="On scene in" value={selected?.etaMin ?? 0} unit="min" />
                    <Stat label="On-scene care" value={transport.onSceneCareMin} unit="min" />
                    <Stat label="Transport" value={transport.transportMin} unit="min" />
                    <Stat
                      label="At hospital in"
                      value={transport.totalToHospitalMin}
                      unit="min"
                      tone="text-[color:var(--success)]"
                    />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Receiving facility: {transport.hospitalName} ({result.hospital?.freeBeds} beds free),{" "}
                    {transport.distanceKm} km from the scene — {transport.baseDriveMin} min free-flow drive plus{" "}
                    {transport.trafficDelayMin} min of traffic delay.
                    {trafficAI
                      ? ` Traffic officer status "${trafficAI.policeActivity.replace(/_/g, " ")}", predicted lane clearance ${trafficAI.predictedClearanceMinutes} min — ${
                          transport.clearanceSavedMin > 0
                            ? `that clearing saves ${transport.clearanceSavedMin} min on the corridor.`
                            : "the corridor is still congested for the whole run, so no time is recovered."
                        }`
                      : " Upload a traffic camera frame to factor officer-led lane clearance into this ETA."}
                  </p>
                </Panel>
              )}
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-surface text-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
