/**
 * DecisionTwin — the simulation + decision core of ResQAlert.
 *
 * This is a real, running module: deterministic geospatial math, rule-based
 * severity classification, traffic-aware ETA prediction, resource matching and
 * scenario evaluation. Demo/simulated fleet data is used because live municipal
 * responder feeds are not available (as noted in the project design).
 */

export type EmergencyType = "medical" | "fire" | "crime" | "accident" | "rescue";
export type Severity = "critical" | "high" | "moderate" | "low";
export type TrafficCondition = "clear" | "moderate" | "heavy" | "gridlock";
export type ResponderKind = "ambulance" | "fire" | "police" | "rescue";

export interface Coords {
  lat: number;
  lng: number;
}

export interface Zone {
  id: string;
  name: string;
  coords: Coords;
  baseTraffic: TrafficCondition;
}

export interface Responder {
  id: string;
  name: string;
  kind: ResponderKind;
  coords: Coords;
  avgSpeedKmh: number;
  /** minutes between dispatch acceptance and wheels rolling */
  mobilizationMin: number;
  available: boolean;
  crew: number;
}

export interface Hospital {
  id: string;
  name: string;
  coords: Coords;
  freeBeds: number;
  traumaCapable: boolean;
}

export interface EmergencyReport {
  type: EmergencyType;
  description: string;
  zoneId: string;
  coords: Coords;
  reportedSeverity: Severity;
  peopleAffected: number;
}

export interface Classification {
  severity: Severity;
  score: number;
  priority: 1 | 2 | 3 | 4;
  requiredKinds: ResponderKind[];
  signals: string[];
  slaMinutes: number;
}

export interface EtaBreakdown {
  responderId: string;
  responderName: string;
  kind: ResponderKind;
  distanceKm: number;
  driveMin: number;
  trafficDelayMin: number;
  mobilizationMin: number;
  etaMin: number;
  available: boolean;
}

export interface Strategy {
  id: string;
  label: string;
  units: EtaBreakdown[];
  /** ETA of the last needed unit on scene */
  etaMin: number;
  coveragePct: number;
  score: number;
  rationale: string;
}

export interface SimulationResult {
  classification: Classification;
  traffic: TrafficCondition;
  etas: EtaBreakdown[];
  strategies: Strategy[];
  recommended: Strategy;
  hospital: Hospital | null;
  baseline: {
    label: string;
    etaMin: number;
    distanceKm: number;
    unitName: string;
  };
  improvementMin: number;
  improvementPct: number;
  decisionMs: number;
  scenariosEvaluated: number;
}

/* ------------------------------------------------------------------ data */

export const ZONES: Zone[] = [
  { id: "z1", name: "Central Station District", coords: { lat: 52.3791, lng: 4.9003 }, baseTraffic: "heavy" },
  { id: "z2", name: "Riverside Industrial Park", coords: { lat: 52.3602, lng: 4.8721 }, baseTraffic: "moderate" },
  { id: "z3", name: "Northgate Residential", coords: { lat: 52.4025, lng: 4.9184 }, baseTraffic: "clear" },
  { id: "z4", name: "University Quarter", coords: { lat: 52.3668, lng: 4.9271 }, baseTraffic: "moderate" },
  { id: "z5", name: "Harbour Ring Road", coords: { lat: 52.3899, lng: 4.8502 }, baseTraffic: "gridlock" },
];

export const RESPONDERS: Responder[] = [
  { id: "amb-01", name: "Ambulance A-01", kind: "ambulance", coords: { lat: 52.3689, lng: 4.8712 }, avgSpeedKmh: 44, mobilizationMin: 1.5, available: true, crew: 2 },
  { id: "amb-02", name: "Ambulance A-02", kind: "ambulance", coords: { lat: 52.4108, lng: 4.9320 }, avgSpeedKmh: 48, mobilizationMin: 1.2, available: true, crew: 2 },
  { id: "amb-03", name: "Ambulance A-03", kind: "ambulance", coords: { lat: 52.3530, lng: 4.9250 }, avgSpeedKmh: 42, mobilizationMin: 2, available: false, crew: 2 },
  { id: "pol-01", name: "Police Unit P-11", kind: "police", coords: { lat: 52.3812, lng: 4.9020 }, avgSpeedKmh: 52, mobilizationMin: 0.8, available: true, crew: 2 },
  { id: "pol-02", name: "Police Unit P-14", kind: "police", coords: { lat: 52.3640, lng: 4.9410 }, avgSpeedKmh: 50, mobilizationMin: 1, available: true, crew: 2 },
  { id: "fire-01", name: "Fire Engine F-07", kind: "fire", coords: { lat: 52.3705, lng: 4.8590 }, avgSpeedKmh: 38, mobilizationMin: 2.5, available: true, crew: 6 },
  { id: "fire-02", name: "Fire Engine F-09", kind: "fire", coords: { lat: 52.4140, lng: 4.8830 }, avgSpeedKmh: 36, mobilizationMin: 2.8, available: true, crew: 6 },
  { id: "res-01", name: "Rescue Team R-02", kind: "rescue", coords: { lat: 52.3930, lng: 4.8420 }, avgSpeedKmh: 40, mobilizationMin: 3, available: true, crew: 4 },
];

export const HOSPITALS: Hospital[] = [
  { id: "h1", name: "St. Marien General", coords: { lat: 52.3835, lng: 4.9115 }, freeBeds: 12, traumaCapable: true },
  { id: "h2", name: "Northgate Community", coords: { lat: 52.4048, lng: 4.9099 }, freeBeds: 4, traumaCapable: false },
  { id: "h3", name: "Harbour Trauma Centre", coords: { lat: 52.3880, lng: 4.8615 }, freeBeds: 7, traumaCapable: true },
];

/* ------------------------------------------------------------- primitives */

const TRAFFIC_FACTOR: Record<TrafficCondition, number> = {
  clear: 1,
  moderate: 1.25,
  heavy: 1.55,
  gridlock: 1.9,
};

export const TRAFFIC_LABEL: Record<TrafficCondition, string> = {
  clear: "Clear",
  moderate: "Moderate",
  heavy: "Heavy",
  gridlock: "Gridlock",
};

export function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** straight-line distance under-estimates real streets; 1.35 is a road factor */
const ROAD_FACTOR = 1.35;

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/* --------------------------------------------------- 1. classification */

const CRITICAL_WORDS = ["unconscious", "not breathing", "cardiac", "bleeding", "trapped", "explosion", "collapse", "drowning", "gunshot", "stabbed"];
const HIGH_WORDS = ["fire", "smoke", "fracture", "crash", "chest pain", "burn", "seizure", "assault", "flood"];

const SEVERITY_BASE: Record<Severity, number> = { critical: 78, high: 58, moderate: 36, low: 18 };

const TYPE_KINDS: Record<EmergencyType, ResponderKind[]> = {
  medical: ["ambulance"],
  fire: ["fire", "ambulance"],
  crime: ["police"],
  accident: ["ambulance", "police"],
  rescue: ["rescue", "ambulance"],
};

export function classify(report: EmergencyReport): Classification {
  const text = report.description.toLowerCase();
  const signals: string[] = [];
  let score = SEVERITY_BASE[report.reportedSeverity];
  signals.push(`Reporter severity "${report.reportedSeverity}" → base ${score}`);

  const critHits = CRITICAL_WORDS.filter((w) => text.includes(w));
  const highHits = HIGH_WORDS.filter((w) => text.includes(w));
  if (critHits.length) {
    score += 18 + (critHits.length - 1) * 4;
    signals.push(`Life-threat keywords: ${critHits.join(", ")} (+${18 + (critHits.length - 1) * 4})`);
  }
  if (highHits.length) {
    score += 8 + (highHits.length - 1) * 3;
    signals.push(`Escalation keywords: ${highHits.join(", ")} (+${8 + (highHits.length - 1) * 3})`);
  }
  if (report.peopleAffected >= 5) {
    score += 12;
    signals.push(`Mass-casualty scale (${report.peopleAffected} people) (+12)`);
  } else if (report.peopleAffected > 1) {
    score += 5;
    signals.push(`Multiple people affected (${report.peopleAffected}) (+5)`);
  }
  if (report.type === "fire" || report.type === "rescue") {
    score += 6;
    signals.push(`High-risk incident type "${report.type}" (+6)`);
  }

  score = Math.max(5, Math.min(100, Math.round(score)));

  const severity: Severity =
    score >= 80 ? "critical" : score >= 60 ? "high" : score >= 38 ? "moderate" : "low";
  const priority = (severity === "critical" ? 1 : severity === "high" ? 2 : severity === "moderate" ? 3 : 4) as 1 | 2 | 3 | 4;
  const sla = severity === "critical" ? 8 : severity === "high" ? 12 : severity === "moderate" ? 18 : 30;

  const requiredKinds = [...TYPE_KINDS[report.type]];
  if (severity === "critical" && !requiredKinds.includes("police")) requiredKinds.push("police");

  return { severity, score, priority, requiredKinds, signals, slaMinutes: sla };
}

/* --------------------------------------------------- 2. ETA prediction */

function etaFor(r: Responder, target: Coords, traffic: TrafficCondition): EtaBreakdown {
  const straight = haversineKm(r.coords, target);
  const distanceKm = straight * ROAD_FACTOR;
  const driveMin = (distanceKm / r.avgSpeedKmh) * 60;
  const trafficDelayMin = driveMin * (TRAFFIC_FACTOR[traffic] - 1);
  const etaMin = driveMin + trafficDelayMin + r.mobilizationMin;
  return {
    responderId: r.id,
    responderName: r.name,
    kind: r.kind,
    distanceKm: round(distanceKm, 2),
    driveMin: round(driveMin),
    trafficDelayMin: round(trafficDelayMin),
    mobilizationMin: r.mobilizationMin,
    etaMin: round(etaMin),
    available: r.available,
  };
}

/* ----------------------------------- 3. scenario simulation + decision */

export function simulate(report: EmergencyReport, trafficOverride?: TrafficCondition): SimulationResult {
  const t0 = Date.now();
  const zone = ZONES.find((z) => z.id === report.zoneId) ?? ZONES[0]!;
  const traffic = trafficOverride ?? zone.baseTraffic;
  const classification = classify(report);

  const etas = RESPONDERS.map((r) => etaFor(r, report.coords, traffic)).sort((a, b) => a.etaMin - b.etaMin);
  const usable = etas.filter((e) => e.available);

  const pick = (kind: ResponderKind) => usable.find((e) => e.kind === kind);
  const strategies: Strategy[] = [];
  let scenarios = 0;

  // Scenario A — single fastest suitable unit
  const primaryKind = classification.requiredKinds[0]!;
  const primary = pick(primaryKind) ?? usable[0];
  if (primary) {
    scenarios++;
    strategies.push({
      id: "single",
      label: `Single unit — ${primary.responderName}`,
      units: [primary],
      etaMin: primary.etaMin,
      coveragePct: Math.round((1 / classification.requiredKinds.length) * 100),
      score: 0,
      rationale: "Fastest individual unit matching the primary need. Lowest resource cost.",
    });
  }

  // Scenario B — full required-capability team (parallel dispatch)
  const team = classification.requiredKinds.map((k) => pick(k)).filter((u): u is EtaBreakdown => Boolean(u));
  if (team.length > 1) {
    scenarios++;
    strategies.push({
      id: "team",
      label: `Combined team — ${team.map((u) => u.responderName).join(" + ")}`,
      units: team,
      etaMin: round(Math.max(...team.map((u) => u.etaMin))),
      coveragePct: Math.round((team.length / classification.requiredKinds.length) * 100),
      score: 0,
      rationale: "All required capabilities dispatched in parallel; full on-scene capability.",
    });
  }

  // Scenario C — staged: fastest unit anywhere first, capability unit follows
  if (usable.length > 1 && primary && usable[0]!.responderId !== primary.responderId) {
    scenarios++;
    const staged = [usable[0]!, primary];
    strategies.push({
      id: "staged",
      label: `Staged — ${usable[0]!.responderName} first, ${primary.responderName} follows`,
      units: staged,
      etaMin: usable[0]!.etaMin,
      coveragePct: 100,
      score: 0,
      rationale: "Nearest unit stabilises the scene while the specialist unit is en route.",
    });
  }

  // Scenario D — second-best capability unit kept in reserve (redundancy check)
  const backup = usable.filter((e) => e.kind === primaryKind)[1];
  if (backup) {
    scenarios++;
    strategies.push({
      id: "backup",
      label: `Reserve-aware — ${backup.responderName}`,
      units: [backup],
      etaMin: backup.etaMin,
      coveragePct: Math.round((1 / classification.requiredKinds.length) * 100),
      score: 0,
      rationale: "Keeps the closest unit free for the next call; slower but preserves city-wide cover.",
    });
  }

  // Decision engine: weight speed vs capability coverage vs SLA compliance
  const wSpeed = classification.severity === "critical" ? 0.62 : classification.severity === "high" ? 0.52 : 0.4;
  for (const s of strategies) {
    const speedScore = Math.max(0, 1 - s.etaMin / 25);
    const coverage = s.coveragePct / 100;
    const slaBonus = s.etaMin <= classification.slaMinutes ? 0.12 : 0;
    const unitPenalty = (s.units.length - 1) * (classification.severity === "critical" ? 0.01 : 0.05);
    s.score = round(Math.max(0, wSpeed * speedScore + (1 - wSpeed) * coverage + slaBonus - unitPenalty) * 100, 1);
  }
  strategies.sort((a, b) => b.score - a.score);
  const recommended = strategies[0]!;

  // Traditional baseline: manual triage over the phone, then the nearest unit
  // on the map — straight-line distance only, no traffic model, no live
  // availability check, no capability match.
  const MANUAL_TRIAGE_MIN = 2.4; // operator questioning + paper priority call
  const nearestRaw = RESPONDERS.map((r) => ({ r, km: haversineKm(r.coords, report.coords) })).sort((a, b) => a.km - b.km)[0]!;
  const baselineEta = etaFor(nearestRaw.r, report.coords, traffic);
  let baselinePenalty = MANUAL_TRIAGE_MIN;
  const reasons: string[] = ["manual phone triage"];
  if (!nearestRaw.r.available) {
    baselinePenalty += 6.5; // busy unit declines, call is re-issued
    reasons.push("unit already on a call → re-dispatch");
  }
  if (!classification.requiredKinds.includes(nearestRaw.r.kind)) {
    // wrong capability sent first; the correct unit only rolls after the
    // mistake is noticed on scene
    const correct = usable.find((e) => e.kind === primaryKind);
    baselinePenalty += correct ? Math.max(3, correct.etaMin - baselineEta.etaMin) : 4;
    reasons.push(`wrong capability (${KIND_LABEL[nearestRaw.r.kind]}) sent first`);
  }
  const baselineTotal = round(baselineEta.etaMin + baselinePenalty);

  const hospital =
    report.type === "crime"
      ? null
      : HOSPITALS.filter((h) => h.freeBeds > 0 && (classification.severity !== "critical" || h.traumaCapable)).sort(
          (a, b) => haversineKm(a.coords, report.coords) - haversineKm(b.coords, report.coords),
        )[0] ?? null;

  const improvementMin = round(baselineTotal - recommended.etaMin);

  return {
    classification,
    traffic,
    etas,
    strategies,
    recommended,
    hospital,
    baseline: {
      label: `Nearest-unit dispatch (${reasons.join(", ")})`,
      etaMin: baselineTotal,
      distanceKm: round(nearestRaw.km * ROAD_FACTOR, 2),
      unitName: nearestRaw.r.name,
    },
    improvementMin,
    improvementPct: baselineTotal > 0 ? Math.round((improvementMin / baselineTotal) * 100) : 0,
    decisionMs: Math.max(1, Date.now() - t0),
    scenariosEvaluated: scenarios,
  };
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  moderate: "Moderate",
  low: "Low",
};

export const TYPE_LABEL: Record<EmergencyType, string> = {
  medical: "Medical",
  fire: "Fire",
  crime: "Crime / Security",
  accident: "Road accident",
  rescue: "Rescue / Trapped",
};

export const KIND_LABEL: Record<ResponderKind, string> = {
  ambulance: "Ambulance",
  fire: "Fire & Rescue",
  police: "Police",
  rescue: "Rescue team",
};

/* ------------------------------------------- 4. GPS zone snap + transport */

/** Snap a raw GPS fix to the nearest modelled city zone. */
export function nearestZone(coords: Coords): { zone: Zone; offsetKm: number } {
  const ranked = ZONES.map((z) => ({ zone: z, offsetKm: round(haversineKm(z.coords, coords), 2) })).sort(
    (a, b) => a.offsetKm - b.offsetKm,
  );
  return ranked[0]!;
}

export interface TransportPlan {
  hospitalName: string;
  distanceKm: number;
  baseDriveMin: number;
  trafficDelayMin: number;
  clearanceSavedMin: number;
  transportMin: number;
  onSceneCareMin: number;
  /** scene ETA + on-scene care + transport = patient handed over at hospital */
  totalToHospitalMin: number;
}

/**
 * Transport leg prediction, scene → hospital.
 *
 * `policeClearanceMin` comes from the traffic-camera vision model: how long
 * until a lane is passable. The congested share of the leg shrinks as the
 * officer clears it, so the traffic delay is scaled by how much of the drive
 * still overlaps the congestion window.
 */
export function predictTransport(opts: {
  scene: Coords;
  hospital: Hospital;
  traffic: TrafficCondition;
  sceneEtaMin: number;
  policeClearanceMin?: number | null;
  ambulanceSpeedKmh?: number;
  onSceneCareMin?: number;
}): TransportPlan {
  const speed = opts.ambulanceSpeedKmh ?? 45;
  const onSceneCareMin = opts.onSceneCareMin ?? 4;
  const distanceKm = haversineKm(opts.scene, opts.hospital.coords) * ROAD_FACTOR;
  const baseDriveMin = (distanceKm / speed) * 60;
  const rawDelay = baseDriveMin * (TRAFFIC_FACTOR[opts.traffic] - 1);

  let delay = rawDelay;
  const clearance = opts.policeClearanceMin;
  if (clearance !== null && clearance !== undefined) {
    // Fraction of the drive that is still inside the congestion window.
    const overlap = Math.min(1, clearance / Math.max(1, baseDriveMin + rawDelay));
    // Even an actively cleared corridor keeps ~30% of its delay.
    delay = rawDelay * (0.3 + 0.7 * overlap);
  }

  const transportMin = baseDriveMin + delay;
  return {
    hospitalName: opts.hospital.name,
    distanceKm: round(distanceKm, 2),
    baseDriveMin: round(baseDriveMin),
    trafficDelayMin: round(delay),
    clearanceSavedMin: round(Math.max(0, rawDelay - delay)),
    transportMin: round(transportMin),
    onSceneCareMin,
    totalToHospitalMin: round(opts.sceneEtaMin + onSceneCareMin + transportMin),
  };
}

/** Map a vision congestion score + officer activity onto the traffic twin. */
export function trafficFromVision(congestionPct: number): TrafficCondition {
  if (congestionPct >= 80) return "gridlock";
  if (congestionPct >= 55) return "heavy";
  if (congestionPct >= 25) return "moderate";
  return "clear";
}
