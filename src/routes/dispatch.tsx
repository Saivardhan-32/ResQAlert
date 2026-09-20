import { createFileRoute, Link } from "@tanstack/react-router";
import { Panel, SeverityBadge, Shell, StatusPill, Stat } from "@/components/rq";
import { SEVERITY_LABEL, TRAFFIC_LABEL, TYPE_LABEL, ZONES } from "@/lib/decision-twin";
import { STATUS_LABEL, STATUS_ORDER, advance, resetAll, useIncidents } from "@/lib/incident-store";

export const Route = createFileRoute("/dispatch")({
  head: () => ({
    meta: [
      { title: "Dispatch console — ResQAlert live response tracking" },
      {
        name: "description",
        content:
          "Authorised dispatcher view: live incident status, assigned units, ETA versus actual response time and the full DecisionTwin decision log.",
      },
      { property: "og:title", content: "ResQAlert dispatch console" },
      {
        property: "og:description",
        content: "Track dispatched units from en route to resolved, with DecisionTwin re-simulating on every status update.",
      },
    ],
  }),
  component: DispatchPage,
});

function DispatchPage() {
  const incidents = useIncidents();
  const active = incidents.filter((i) => i.status !== "resolved").length;
  const avgSaved = incidents.length
    ? Math.round((incidents.reduce((a, i) => a + i.simulation.improvementMin, 0) / incidents.length) * 10) / 10
    : 0;

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Dispatch → Track → Resolve</p>
          <h1 className="mt-2 text-3xl font-bold">Dispatch console</h1>
        </div>
        {incidents.length > 0 && (
          <button
            onClick={resetAll}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Clear board
          </button>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total incidents" value={incidents.length} />
        <Stat label="Active now" value={active} />
        <Stat label="Resolved" value={incidents.length - active} />
        <Stat label="Avg time saved" value={avgSaved} unit="min" />
      </div>

      {incidents.length === 0 ? (
        <Panel className="grid min-h-56 place-items-center text-center">
          <div className="max-w-sm">
            <h2 className="text-base font-bold">No incidents on the board</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              File a report and authorise a dispatch to see live tracking here.
            </p>
            <Link
              to="/"
              className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Report an emergency
            </Link>
          </div>
        </Panel>
      ) : (
        <div className="space-y-5">
          {incidents.map((inc) => {
            const zone = ZONES.find((z) => z.id === inc.report.zoneId);
            const strategy = inc.simulation.strategies.find(
              (s) => s.units.map((u) => u.responderId).join() === inc.dispatchedUnitIds.join(),
            );
            const eta = strategy?.etaMin ?? inc.simulation.recommended.etaMin;
            const stageIdx = STATUS_ORDER.indexOf(inc.status);

            return (
              <Panel key={inc.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">{inc.id}</h2>
                      <SeverityBadge
                        severity={inc.simulation.classification.severity}
                        score={inc.simulation.classification.score}
                      />
                      <StatusPill status={inc.status} label={STATUS_LABEL[inc.status]} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {TYPE_LABEL[inc.report.type]} · {zone?.name} · traffic{" "}
                      {TRAFFIC_LABEL[inc.simulation.traffic].toLowerCase()} · {inc.report.peopleAffected} affected
                    </p>
                  </div>
                  {inc.status !== "resolved" && (
                    <button
                      onClick={() => advance(inc.id)}
                      className="rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary hover:bg-accent"
                    >
                      Force next status
                    </button>
                  )}
                </div>

                <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm">“{inc.report.description}”</p>

                {/* live stage rail */}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {STATUS_ORDER.map((s, i) => (
                    <span
                      key={s}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                        i < stageIdx
                          ? "bg-success/15 text-[color:var(--success)]"
                          : i === stageIdx
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABEL[s]}
                    </span>
                  ))}
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-sm font-bold">Assigned units</h3>
                    <ul className="space-y-1.5 text-sm">
                      {inc.simulation.etas
                        .filter((e) => inc.dispatchedUnitIds.includes(e.responderId))
                        .map((e) => (
                          <li
                            key={e.responderId}
                            className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                          >
                            <span className="font-medium">{e.responderName}</span>
                            <span className="text-muted-foreground">
                              {e.distanceKm} km · ETA {e.etaMin} min
                            </span>
                          </li>
                        ))}
                    </ul>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <Stat label="ETA" value={eta} unit="min" />
                      <Stat label="Elapsed" value={inc.elapsedMin} unit="min" />
                      <Stat
                        label="vs traditional"
                        value={`-${inc.simulation.improvementMin}`}
                        unit="min"
                        tone="text-[color:var(--success)]"
                      />
                    </div>
                    {inc.simulation.hospital && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Receiving hospital: {inc.simulation.hospital.name} ({inc.simulation.hospital.freeBeds} beds
                        free)
                      </p>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-bold">Decision &amp; status log</h3>
                    <ol className="space-y-1.5 text-xs">
                      {inc.log.map((l, i) => (
                        <li key={`${l.at}-${i}`} className="flex gap-2">
                          <span className="shrink-0 font-mono text-muted-foreground">
                            {new Date(l.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                          <span>{l.text}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>

                <details className="mt-4 text-xs">
                  <summary className="cursor-pointer font-semibold text-primary">
                    Why this strategy? ({SEVERITY_LABEL[inc.simulation.classification.severity]} weighting)
                  </summary>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {inc.simulation.strategies.map((s) => (
                      <li key={s.id}>
                        • {s.label} — ETA {s.etaMin} min, coverage {s.coveragePct}%, score {s.score}
                      </li>
                    ))}
                  </ul>
                </details>
              </Panel>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
