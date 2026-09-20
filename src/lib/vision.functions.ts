/**
 * Vision perception layer of ResQAlert ("Sense").
 *
 * Two server functions run real multimodal AI over uploaded imagery:
 *  1. analyzeScene       — accident / fire / emergency photo → type + severity
 *  2. analyzeTrafficCam  — traffic camera frame → congestion, traffic police
 *                          presence and activity, predicted clearance time
 *
 * The structured output feeds straight into the DecisionTwin simulation.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ImageInput = z.object({
  /** data URL: data:image/jpeg;base64,... */
  dataUrl: z.string().min(32),
  mediaType: z.string().min(3),
  note: z.string().max(1500).default(""),
});

export const SceneAnalysisSchema = z.object({
  emergencyType: z.enum(["medical", "fire", "crime", "accident", "rescue"]),
  severity: z.enum(["low", "moderate", "high", "critical"]),
  severityScore: z.number(),
  peopleAffected: z.number(),
  visibleSigns: z.array(z.string()),
  hazards: z.array(z.string()),
  summary: z.string(),
  requiresAmbulance: z.boolean(),
  confidence: z.number(),
});
export type SceneAnalysis = z.infer<typeof SceneAnalysisSchema>;

export const TrafficAnalysisSchema = z.object({
  condition: z.enum(["clear", "moderate", "heavy", "gridlock"]),
  congestionPct: z.number(),
  vehiclesVisible: z.number(),
  blockedLanes: z.number(),
  trafficPolicePresent: z.boolean(),
  policeActivity: z.enum(["absent", "present_idle", "directing_traffic", "actively_clearing"]),
  policeCount: z.number(),
  predictedClearanceMinutes: z.number(),
  observations: z.array(z.string()),
  confidence: z.number(),
});
export type TrafficAnalysis = z.infer<typeof TrafficAnalysisSchema>;

const SCENE_PROMPT = `You are the perception module of an emergency dispatch system.
Look at the photograph of an emergency scene and report what you actually see.
Rules:
- emergencyType: the dominant emergency visible.
- severity / severityScore (0-100): judge from visible injuries, fire size, vehicle deformation, people trapped, spilled fuel, crowd, smoke volume.
- peopleAffected: count people who appear injured or endangered (0 if none visible).
- visibleSigns: short factual observations you based the severity on.
- hazards: on-scene dangers for responders (fire, fuel leak, live wires, unstable structure, oncoming traffic...).
- summary: one sentence a dispatcher can read aloud.
- confidence: 0-1, lower it when the image is unclear or not an emergency.
Never invent detail that is not visible.`;

const TRAFFIC_PROMPT = `You are the traffic perception module of an emergency dispatch system.
The image is a frame from a traffic camera near an emergency scene.
Rules:
- condition + congestionPct (0-100): from vehicle density, queue length, spacing and lane blockage.
- blockedLanes: lanes visibly obstructed.
- trafficPolicePresent / policeCount: look for traffic police or wardens (uniform, hi-vis vest, whistle, hand signals in the roadway).
- policeActivity: "absent" when none; "present_idle" when standing aside; "directing_traffic" when signalling vehicles; "actively_clearing" when opening a lane / pushing traffic aside for an emergency vehicle.
- predictedClearanceMinutes: how long until an ambulance lane is passable. Consider congestion, blocked lanes, and the officer's activity — active clearing shortens it a lot, no officer lengthens it.
- observations: short factual notes backing your numbers.
- confidence: 0-1.
Never invent detail that is not visible.`;

async function analyzeImage<T extends z.ZodTypeAny>(
  dataUrl: string,
  mediaType: string,
  system: string,
  note: string,
  schema: T,
): Promise<z.infer<T>> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this app (missing key).");

  const [{ createOpenAI }, { streamText, Output }, { createLovableAiGatewayRunIdFetch }] =
    await Promise.all([
      import("@ai-sdk/openai"),
      import("ai"),
      import("./ai-gateway.server"),
    ]);

  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const lovable = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch as typeof fetch,
  });

  const result = streamText({
    model: lovable.responses("openai/gpt-6-astra"),
    system,
    output: Output.object({ schema }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: note.trim() ? `Dispatcher note: ${note.trim()}` : "Analyse this image." },
          { type: "image", image: dataUrl, mediaType },
        ],
      },
    ],
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  return (await result.output) as z.infer<T>;
}

export const analyzeScene = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ImageInput.parse(input))
  .handler(async ({ data }) =>
    analyzeImage(data.dataUrl, data.mediaType, SCENE_PROMPT, data.note, SceneAnalysisSchema),
  );

export const analyzeTrafficCam = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ImageInput.parse(input))
  .handler(async ({ data }) =>
    analyzeImage(data.dataUrl, data.mediaType, TRAFFIC_PROMPT, data.note, TrafficAnalysisSchema),
  );
