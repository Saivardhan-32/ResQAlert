import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Panel } from "@/components/rq";
import { analyzeScene, analyzeTrafficCam } from "@/lib/vision.functions";
import type { SceneAnalysis, TrafficAnalysis } from "@/lib/vision.functions";

/** Downscale to keep the upload payload small before sending to the model. */
async function toDataUrl(file: File, maxEdge = 1024): Promise<{ dataUrl: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), mediaType: "image/jpeg" };
}

function Dropzone({
  label,
  hint,
  preview,
  busy,
  onPick,
}: {
  label: string;
  hint: string;
  preview: string | null;
  busy: boolean;
  onPick: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className="relative block w-full overflow-hidden rounded-xl border border-dashed border-input bg-muted/30 p-0 text-left transition-colors hover:bg-muted/60 disabled:opacity-70"
      >
        {preview ? (
          <img src={preview} alt={label} className="h-44 w-full object-cover" />
        ) : (
          <div className="grid h-44 place-items-center px-4 text-center">
            <span>
              <span className="block text-sm font-semibold">{label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
            </span>
          </div>
        )}
        {busy && (
          <span className="absolute inset-0 grid place-items-center bg-background/70 text-xs font-semibold">
            <span>
              <span className="pulse-dot mr-2 inline-block size-2 rounded-full bg-primary align-middle" />
              Analysing image…
            </span>
          </span>
        )}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function PerceptionPanel({
  note,
  scene,
  traffic,
  onScene,
  onTraffic,
  onLocation,
  locationLabel,
}: {
  note: string;
  scene: SceneAnalysis | null;
  traffic: TrafficAnalysis | null;
  onScene: (a: SceneAnalysis) => void;
  onTraffic: (a: TrafficAnalysis) => void;
  onLocation: (c: { lat: number; lng: number }) => void;
  locationLabel: string;
}) {
  const runScene = useServerFn(analyzeScene);
  const runTraffic = useServerFn(analyzeTrafficCam);
  const [scenePreview, setScenePreview] = useState<string | null>(null);
  const [camPreview, setCamPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"scene" | "cam" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  async function handle(kind: "scene" | "cam", file: File) {
    setError(null);
    setBusy(kind);
    try {
      const img = await toDataUrl(file);
      if (kind === "scene") setScenePreview(img.dataUrl);
      else setCamPreview(img.dataUrl);
      const payload = { ...img, note: note.slice(0, 1400) };
      if (kind === "scene") onScene(await runScene({ data: payload }));
      else onTraffic(await runTraffic({ data: payload }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image analysis failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  function captureLocation() {
    if (!("geolocation" in navigator)) {
      setError("This device cannot share its location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError("Location permission denied — pick the zone manually below.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <Panel step={1} title="AI perception — photo, camera &amp; live location">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Dropzone
            label="Upload accident / emergency photo"
            hint="The AI reads the scene and predicts the emergency type and severity on its own."
            preview={scenePreview}
            busy={busy === "scene"}
            onPick={(f) => void handle("scene", f)}
          />
          {scene && (
            <ul className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-xs">
              <li className="text-sm font-semibold">
                {scene.emergencyType} · {scene.severity} ({scene.severityScore}/100)
              </li>
              <li className="text-muted-foreground">{scene.summary}</li>
              <li className="text-muted-foreground">
                People at risk: {scene.peopleAffected} · confidence {Math.round(scene.confidence * 100)}%
              </li>
              {scene.visibleSigns.slice(0, 4).map((s) => (
                <li key={s} className="text-muted-foreground">• {s}</li>
              ))}
              {scene.hazards.length > 0 && (
                <li className="font-medium text-[color:var(--destructive)]">
                  Hazards: {scene.hazards.join(", ")}
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <Dropzone
            label="Upload traffic camera frame"
            hint="Reads congestion, spots a traffic officer, judges whether they are clearing the road and predicts clearance time."
            preview={camPreview}
            busy={busy === "cam"}
            onPick={(f) => void handle("cam", f)}
          />
          {traffic && (
            <ul className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-xs">
              <li className="text-sm font-semibold">
                {traffic.condition} · {traffic.congestionPct}% congested · {traffic.blockedLanes} lane(s) blocked
              </li>
              <li className="text-muted-foreground">
                Traffic police: {traffic.trafficPolicePresent ? `${traffic.policeCount} present` : "none detected"} ·
                activity {traffic.policeActivity.replace(/_/g, " ")}
              </li>
              <li className="font-medium">
                Predicted lane clearance: {traffic.predictedClearanceMinutes} min
              </li>
              {traffic.observations.slice(0, 4).map((o) => (
                <li key={o} className="text-muted-foreground">• {o}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={captureLocation}
          disabled={locating}
          className="rounded-lg border border-input bg-surface px-3 py-2 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-60"
        >
          {locating ? "Getting GPS fix…" : "Share live location of the emergency"}
        </button>
        <span className="text-xs text-muted-foreground">{locationLabel}</span>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-[color:var(--destructive)] px-3 py-2 text-xs text-[color:var(--destructive)]">
          {error}
        </p>
      )}
    </Panel>
  );
}
