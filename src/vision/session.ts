// Live screenshot mode (service worker only): capture → detect a new settled question → solve.
import { decide, visionConfig, type ChangeState, type Decision } from "./change";
import { OpenAIProvider } from "../providers/openai";
import { JevDecisionEngine } from "../jev/client";
import { solveAdvanced } from "../solver/advanced";
import { reportIssue, clearIssue } from "../providers/diagnostics";
import { defaults, type Settings } from "../config";
import type { Result } from "../solver/types";
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface FrameMessage {
  type: "vision-frame";
  /** Overlay card bounds in CSS pixels, blanked out so the model never reads its own answer. */
  mask: Rect | null;
  viewportWidth: number;
  /** Words of visible page text that differ from when the last screenshot was solved. */
  textDelta: number;
  /** Solve the next settled frame even if it looks unchanged (the solve-now shortcut). */
  force?: boolean;
}
export interface VisionUpdate {
  type: "vision-result";
  pending?: boolean;
  result?: Result | null;
  ms?: number;
}
interface Session extends ChangeState {
  capturing: boolean;
  /** Union of all overlay positions seen, so the overlay appearing never counts as a page change. */
  mask?: Rect;
  controller?: AbortController;
}
const sessions = new Map<number, Session>();
export function stopVision(tab: number) {
  sessions.get(tab)?.controller?.abort();
  sessions.delete(tab);
}
export function validFrame(message: unknown): message is FrameMessage {
  const m = message as FrameMessage;
  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  return (
    finite(m?.viewportWidth) &&
    m.viewportWidth > 0 &&
    finite(m.textDelta) &&
    m.textDelta >= 0 &&
    (m.force === undefined || typeof m.force === "boolean") &&
    (m.mask === null ||
      (typeof m.mask === "object" &&
        finite(m.mask.x) &&
        finite(m.mask.y) &&
        finite(m.mask.width) &&
        finite(m.mask.height)))
  );
}
/** Handles one tick from the page. Returns an error only when capture is not permitted. */
export async function handleFrame(
  tab: number,
  windowId: number,
  message: FrameMessage,
): Promise<{ ok: boolean; error?: string; decision?: Decision }> {
  let session = sessions.get(tab);
  if (!session) sessions.set(tab, (session = { capturing: false, lastChangeAt: 0 }));
  if (session.capturing) return { ok: true };
  session.capturing = true;
  try {
    let dataUrl: string;
    try {
      dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
        format: "jpeg",
        quality: 85,
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      // Rate-limit hiccups are harmless; the next tick retries.
      if (/MAX_CAPTURE|quota/i.test(text)) return { ok: true };
      reportIssue("Vision", `screenshot blocked (${text})`);
      return { ok: false, error: text };
    }
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const scale = bitmap.width / message.viewportWidth;
    if (message.mask && message.mask.width > 0) {
      const next = {
        x: (message.mask.x - 4) * scale,
        y: (message.mask.y - 4) * scale,
        width: (message.mask.width + 8) * scale,
        height: (message.mask.height + 8) * scale,
      };
      session.mask = session.mask ? union(session.mask, next) : next;
    }
    const mask = session.mask ?? null;
    const decision = decide(
      session,
      thumbnail(bitmap, mask),
      performance.now(),
      message.textDelta,
      message.force,
    );
    if (decision === "solve") void solveFrame(tab, session, bitmap, mask);
    else bitmap.close();
    return { ok: true, decision };
  } finally {
    session.capturing = false;
  }
}
function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}
function draw(
  bitmap: ImageBitmap,
  mask: Rect | null,
  width: number,
): OffscreenCanvas {
  const ratio = width / bitmap.width;
  const canvas = new OffscreenCanvas(
    Math.round(width),
    Math.max(1, Math.round(bitmap.height * ratio)),
  );
  const context = canvas.getContext("2d")!;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (mask) {
    context.fillStyle = "#808080";
    context.fillRect(
      mask.x * ratio,
      mask.y * ratio,
      mask.width * ratio,
      mask.height * ratio,
    );
  }
  return canvas;
}
function thumbnail(bitmap: ImageBitmap, mask: Rect | null): Uint8Array {
  const canvas = draw(bitmap, mask, visionConfig.thumbWidth);
  const { data } = canvas
    .getContext("2d")!
    .getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Uint8Array(data.length / 4);
  for (let i = 0; i < gray.length; i++)
    gray[i] = (data[i * 4] * 3 + data[i * 4 + 1] * 6 + data[i * 4 + 2]) / 10;
  return gray;
}
async function encode(bitmap: ImageBitmap, mask: Rect | null) {
  const canvas = draw(bitmap, mask, Math.min(bitmap.width, 1600));
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(binary)}`;
}
function notify(tab: number, update: Omit<VisionUpdate, "type">) {
  void chrome.tabs
    .sendMessage(tab, { type: "vision-result", ...update })
    .catch(() => {});
}
async function solveFrame(
  tab: number,
  session: Session,
  bitmap: ImageBitmap,
  mask: Rect | null,
) {
  // A newer question replaces any screenshot still being solved.
  session.controller?.abort();
  const controller = new AbortController();
  session.controller = controller;
  const started = performance.now();
  const current = () =>
    !controller.signal.aborted && sessions.get(tab) === session;
  try {
    notify(tab, { pending: true });
    const image = await encode(bitmap, mask);
    const stored = await chrome.storage.local.get([
      "settings",
      "jevKey",
      "llmKey",
    ]);
    const settings: Settings = { ...defaults, ...stored.settings };
    const { jevKey, llmKey } = stored;
    if (!settings.llmEnabled || typeof llmKey !== "string" || !llmKey) {
      reportIssue(
        "Setup",
        "live screenshot mode needs LLM answers enabled with an OpenAI key.",
      );
      if (current()) notify(tab, { result: null });
      return;
    }
    const vision = await new OpenAIProvider(
      llmKey,
      settings.llmModel,
      settings.reasoningEffort,
    ).solveImage(image, controller.signal);
    if (!current()) return;
    let result: Result | null = null;
    if (vision) {
      const jev =
        settings.jevEnabled && typeof jevKey === "string" && jevKey
          ? new JevDecisionEngine(jevKey)
          : undefined;
      // Jev checks the model's pick against the choices it read from the screenshot.
      result =
        vision.problem.choices.length >= 2
          ? await solveAdvanced(
              vision.problem,
              { solve: async () => vision.result },
              jev,
              controller.signal,
            )
          : vision.result;
    }
    if (!current()) return;
    if (result) clearIssue();
    notify(tab, { result, ms: performance.now() - started });
  } catch (error) {
    reportIssue("Vision", `solve failed (${error instanceof Error ? error.message : error})`);
    if (current()) notify(tab, { result: null });
  } finally {
    bitmap.close();
  }
}
