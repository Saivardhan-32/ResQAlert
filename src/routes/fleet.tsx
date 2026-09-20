import { createFileRoute } from "@tanstack/react-router";
import { Panel, Shell, Stat } from "@/components/rq";
import { HOSPITALS, KIND_LABEL, RESPONDERS, TRAFFIC_LABEL, ZONES } from "@/lib/decision-twin";

export const Route = createFileRoute("/fleet")({
  head: () => ({
    meta: [
      { title: "Fleet & city twin — ResQAlert" },
      {
        name: "description",
        content:
          "The digital twin behind ResQAlert: responder units, hospital capacity and zone traffic conditions used by every simulation.",
      },
      { property: "og:title", content: "ResQAlert fleet & city twin" },
      {
        property: "og:description",
        content: "Responder twins, hospital twins and traffic twins that feed the DecisionTwin simulation engine.",
      },
    ],
  }),
  component: FleetPage,
});

function FleetPage() {
  const available = RESPONDERS.filter((r) => r.available).length;
  const beds = HOSPITALS.reduce((a, h) => a + h.freeBeds, 0);

  return (
    <Shell>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Model — the digital twin</p>
        <h1 className="mt-2 text-3xl font-bold">Fleet &amp; city twin</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every simulation runs against this state: responder twins, hospital twins and traffic twins. Demo data
          stands in for live municipal feeds.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Units modelled" value={RESPONDERS.length} />
        <Stat label="Available now" value={available} />
        <Stat label="Hospitals" value={HOSPITALS.length} />
        <Stat label="Free beds" value={beds} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Responder twins">
          <ul className="space-y-2 text-sm">
            {RESPONDERS.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span>
                  <span className="font-medium">{r.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {KIND_LABEL[r.kind]} · crew {r.crew} · {r.avgSpeedKmh} km/h · mobilise {r.mobilizationMin} min
                  </span>
                </span>
                <span className={`text-xs font-semibold ${r.available ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]"}`}>
                  {r.available ? "Available" : "On call"}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-5">
          <Panel title="Hospital twins">
            <ul className="space-y-2 text-sm">
              {HOSPITALS.map((h) => (
                <li key={h.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <span className="font-medium">{h.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {h.freeBeds} beds free · {h.traumaCapable ? "trauma capable" : "general care"}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Traffic twins (zones)">
            <ul className="space-y-2 text-sm">
              {ZONES.map((z) => (
                <li key={z.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <span className="font-medium">{z.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {TRAFFIC_LABEL[z.baseTraffic]} · {z.coords.lat.toFixed(3)}, {z.coords.lng.toFixed(3)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}
