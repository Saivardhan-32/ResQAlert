import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { Severity } from "@/lib/decision-twin";
import type { IncidentStatus } from "@/lib/incident-store";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground font-[family-name:var(--font-display)] font-bold">
              R
            </span>
            <span>
              <span className="block font-[family-name:var(--font-display)] text-lg font-bold leading-none">
                ResQAlert
              </span>
              <span className="block text-[11px] uppercase tracking-widest text-muted-foreground">
                + DecisionTwin
              </span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium">
            <NavLink to="/">Report</NavLink>
            <NavLink to="/dispatch">Dispatch console</NavLink>
            <NavLink to="/fleet">Fleet</NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        ResQAlert prototype — Sense → Alert → Model → Simulate → Decide → Dispatch → Track → Resolve.
        Simulated fleet data used where live feeds are unavailable.
      </footer>
    </div>
  );
}

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      activeProps={{ className: "rounded-lg px-3 py-1.5 bg-accent text-accent-foreground" }}
      activeOptions={{ exact: to === "/" }}
    >
      {children}
    </Link>
  );
}

export function Panel({
  title,
  step,
  aside,
  children,
  className = "",
}: {
  title?: string;
  step?: number;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel p-5 ${className}`}>
      {title && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-bold">
            {step !== undefined && (
              <span className="grid size-6 place-items-center rounded-md bg-primary text-xs text-primary-foreground">
                {step}
              </span>
            )}
            {title}
          </h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

const SEV_CLASS: Record<Severity, string> = {
  critical: "bg-critical text-critical-foreground",
  high: "bg-warning text-warning-foreground",
  moderate: "bg-info text-primary-foreground",
  low: "bg-secondary text-secondary-foreground",
};

export function SeverityBadge({ severity, score }: { severity: Severity; score?: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${SEV_CLASS[severity]}`}
    >
      {severity}
      {score !== undefined && <span className="opacity-80">· {score}</span>}
    </span>
  );
}

const STATUS_CLASS: Record<IncidentStatus, string> = {
  reported: "bg-secondary text-secondary-foreground",
  dispatched: "bg-accent text-accent-foreground",
  en_route: "bg-info text-primary-foreground",
  arrived: "bg-warning text-warning-foreground",
  responding: "bg-primary text-primary-foreground",
  resolved: "bg-success text-success-foreground",
};

export function StatusPill({ status, label }: { status: IncidentStatus; label: string }) {
  const live = status !== "resolved" && status !== "reported";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[status]}`}
    >
      {live && <span className="pulse-dot size-1.5 rounded-full bg-current" />}
      {label}
    </span>
  );
}

export function Stat({ label, value, unit, tone = "" }: { label: string; value: string | number; unit?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-[family-name:var(--font-display)] text-xl font-bold ${tone}`}>
        {value}
        {unit && <span className="ml-1 text-xs font-medium text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}
