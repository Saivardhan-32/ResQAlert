/**
 * In-memory incident store with live status progression.
 * Shared across routes via useSyncExternalStore.
 */
import { useSyncExternalStore } from "react";
import type { EmergencyReport, SimulationResult } from "./decision-twin";
import { simulate } from "./decision-twin";

export type IncidentStatus = "reported" | "dispatched" | "en_route" | "arrived" | "responding" | "resolved";

export const STATUS_ORDER: IncidentStatus[] = ["reported", "dispatched", "en_route", "arrived", "responding", "resolved"];

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  reported: "Reported",
  dispatched: "Dispatched",
  en_route: "En route",
  arrived: "Arrived on scene",
  responding: "Responding",
  resolved: "Resolved",
};

export interface LogEntry {
  at: number;
  text: string;
}

export interface Incident {
  id: string;
  createdAt: number;
  report: EmergencyReport;
  simulation: SimulationResult;
  status: IncidentStatus;
  dispatchedUnitIds: string[];
  log: LogEntry[];
  /** simulated real-world minutes elapsed since dispatch */
  elapsedMin: number;
}

let incidents: Incident[] = [];
let seq = 1;
const listeners = new Set<() => void>();

function emit() {
  incidents = [...incidents];
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useIncidents(): Incident[] {
  return useSyncExternalStore(
    subscribe,
    () => incidents,
    () => incidents,
  );
}

export function getIncident(id: string) {
  return incidents.find((i) => i.id === id);
}

function newId() {
  const n = String(seq++).padStart(3, "0");
  return `RQ-${new Date().getFullYear()}-${n}`;
}

export function createIncident(report: EmergencyReport): Incident {
  const simulation = simulate(report);
  const incident: Incident = {
    id: newId(),
    createdAt: Date.now(),
    report,
    simulation,
    status: "reported",
    dispatchedUnitIds: [],
    log: [
      { at: Date.now(), text: "Emergency report received and validated" },
      {
        at: Date.now(),
        text: `Classified ${simulation.classification.severity.toUpperCase()} (score ${simulation.classification.score}, priority P${simulation.classification.priority})`,
      },
      {
        at: Date.now(),
        text: `DecisionTwin evaluated ${simulation.scenariosEvaluated} response scenarios in ${simulation.decisionMs} ms`,
      },
    ],
    elapsedMin: 0,
  };
  incidents = [incident, ...incidents];
  emit();
  return incident;
}

export function dispatchIncident(id: string, strategyId: string) {
  const inc = incidents.find((i) => i.id === id);
  if (!inc || inc.status !== "reported") return;
  const strategy = inc.simulation.strategies.find((s) => s.id === strategyId) ?? inc.simulation.recommended;
  inc.dispatchedUnitIds = strategy.units.map((u) => u.responderId);
  inc.status = "dispatched";
  inc.log = [
    ...inc.log,
    { at: Date.now(), text: `Dispatch authorised: ${strategy.units.map((u) => u.responderName).join(" + ")} (ETA ${strategy.etaMin} min)` },
  ];
  emit();
  runLiveProgression(inc.id, strategy.etaMin);
}

export function advance(id: string) {
  const inc = incidents.find((i) => i.id === id);
  if (!inc) return;
  const idx = STATUS_ORDER.indexOf(inc.status);
  if (idx < 0 || idx >= STATUS_ORDER.length - 1) return;
  const next = STATUS_ORDER[idx + 1]!;
  inc.status = next;
  inc.log = [...inc.log, { at: Date.now(), text: `Status → ${STATUS_LABEL[next]}` }];
  emit();
}

/**
 * Compresses the simulated response timeline into a few seconds of wall clock
 * so the prototype shows a full live lifecycle: en route → arrived →
 * responding → resolved, with DecisionTwin re-simulating on each status feed.
 */
function runLiveProgression(id: string, etaMin: number) {
  const steps: Array<{ delayMs: number; status: IncidentStatus; minutes: number; note: string }> = [
    { delayMs: 1200, status: "en_route", minutes: 0.5, note: "Unit rolling — live GPS feed active" },
    { delayMs: 4000, status: "arrived", minutes: etaMin, note: "Unit on scene" },
    { delayMs: 7000, status: "responding", minutes: etaMin + 1, note: "On-scene response in progress" },
    { delayMs: 11000, status: "resolved", minutes: etaMin + 9, note: "Incident resolved, units clearing" },
  ];
  for (const step of steps) {
    setTimeout(() => {
      const inc = incidents.find((i) => i.id === id);
      if (!inc) return;
      inc.status = step.status;
      inc.elapsedMin = Math.round(step.minutes * 10) / 10;
      inc.log = [...inc.log, { at: Date.now(), text: `${STATUS_LABEL[step.status]} — ${step.note}` }];
      if (step.status === "en_route") {
        inc.log = [
          ...inc.log,
          { at: Date.now(), text: "DecisionTwin re-simulated with live status: ETA holding, no re-route needed" },
        ];
      }
      emit();
    }, step.delayMs);
  }
}

export function resetAll() {
  incidents = [];
  seq = 1;
  emit();
}
