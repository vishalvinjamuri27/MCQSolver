import { extractDrill, scanMCQ } from "./extractor";
import { observeProblems } from "./observer";
import { createSolver } from "../solver/router";
import { defaults, type Settings } from "../config";
import type { DecisionEngine } from "../jev/decision-engine";
import { unknown, type Result } from "../solver/types";
import { visionConfig, wordDelta, words } from "../vision/change";
import type { VisionUpdate } from "../vision/session";
import type { LLMProvider } from "../providers/llm";
import { remote } from "../providers/remote";
async function start() {
  if (document.querySelector("jev-mcq-overlay")) return;
  let settings: Settings = { ...defaults };
  try {
    const saved = await chrome.storage.local.get("settings");
    settings = { ...defaults, ...saved.settings };
  } catch {
    /* Local arithmetic works even when settings are unavailable. */
  }
  if (document.querySelector("jev-mcq-overlay")) return;
  const decision: DecisionEngine = {
    async choose(prompt, options, signal) {
      if (!settings.jevEnabled) return null;
      return remote({ type: "jev-choose", prompt, options }, signal);
    },
  };
  const llm: LLMProvider = {
    solve: async (problem, signal) =>
      settings.llmEnabled
        ? remote<Result>({ type: "solve-advanced", problem }, signal)
        : null,
  };
  let running = true;
  let state = "Watching for a visible MCQ…";
  // Live screenshot mode replaces HTML scanning while it runs.
  let visionTimer: ReturnType<typeof setInterval> | undefined;
  // Screenshots need the permission Chrome grants when Start is clicked in the popup.
  let startClicked = false;
  let ticking = false;
  let forceNext = false;
  // Visible page text when the last screenshot was solved; tells new questions from hovers and timers.
  let solvedWords: string[] | undefined;
  const extract = () => {
    if (!running || visionTimer !== undefined) return null;
    const arithmetic = extractDrill();
    if (arithmetic) return arithmetic;
    const scan = scanMCQ();
    if (!scan.problem)
      state =
        scan.count > 1
          ? "Several MCQs are visible. Scroll to one question."
          : "Watching for a visible MCQ…";
    return scan.problem;
  };
  const solve = createSolver(decision, llm);
  const controller = observeProblems({
    ...settings,
    // Rescan instantly, unless scans are slow (large pages): then at most every 250 ms.
    throttleMs: 250,
    extract,
    onResult: (result) => {
      state =
        result.answer === "?"
          ? "Question found. Add provider keys or check question support."
          : "Answer shown. Watching for the next question…";
    },
    solve: (problem, parsed, signal) => {
      state = "Solving the current question…";
      return solve(problem, parsed, signal);
    },
  });
  async function tick() {
    if (ticking || document.hidden) return;
    ticking = true;
    try {
      const current = words((document.body?.innerText ?? "").slice(0, 20000));
      const force = forceNext;
      const reply = await chrome.runtime.sendMessage({
        type: "vision-frame",
        mask: controller.overlay.bounds(),
        viewportWidth: innerWidth,
        textDelta: solvedWords ? wordDelta(solvedWords, current) : 1e9,
        force,
      });
      if (reply?.decision === "solve") {
        solvedWords = current;
        if (force) forceNext = false;
      }
      if (reply && !reply.ok) {
        stopVision();
        state = `Screenshots blocked. Click the extension and press Start again. (${reply.error})`;
      }
    } catch {
      stopVision(); // Extension was reloaded; this page's script is orphaned.
    } finally {
      ticking = false;
    }
  }
  function startVision() {
    if (visionTimer !== undefined) return;
    visionTimer = setInterval(tick, visionConfig.intervalMs);
    controller.refresh();
    state = "Live screenshot mode: watching for a question…";
    void tick();
  }
  function stopVision() {
    if (visionTimer === undefined) return;
    clearInterval(visionTimer);
    visionTimer = undefined;
    solvedWords = undefined;
    forceNext = false;
    controller.overlay.clear();
    void chrome.runtime.sendMessage({ type: "vision-stop" }).catch(() => {});
  }
  function showVision(update: VisionUpdate) {
    if (visionTimer === undefined) return;
    if (update.pending) {
      state = "Solving the screenshot…";
      controller.overlay.render(
        { answer: "…", choice: null, confidence: 0, solver: "llm" },
        0,
        false,
      );
      return;
    }
    const result = update.result ?? unknown();
    controller.overlay.render(result, update.ms ?? 0, settings.showLatency);
    state = update.result
      ? "Answer shown. Watching for the next question…"
      : "No confident answer. The popup shows the last issue.";
    if (settings.debug)
      console.log("[JEV-MCQ] vision", result, `${(update.ms ?? 0).toFixed(0)} ms`);
  }
  const getState = () => ({
    running,
    status: running ? state : "Stopped on this page.",
  });
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message?.type === "toggle") {
      settings.enabled = !settings.enabled;
      controller.overlay.setEnabled(settings.enabled);
    }
    if (message?.type === "vision-result") showVision(message);
    else if (message?.type === "vision-force") {
      // Solve-now shortcut: screenshot the current screen even if it looks unchanged.
      running = true;
      startClicked = true;
      controller.overlay.setEnabled(true);
      forceNext = true;
      startVision();
      reply(getState());
    } else if (message?.type === "start-scanning") {
      running = true;
      startClicked = true;
      controller.overlay.setEnabled(true);
      if (settings.vision) startVision();
      else controller.refresh();
      reply(getState());
    } else if (message?.type === "stop-scanning") {
      running = false;
      stopVision();
      controller.refresh();
      reply(getState());
    } else if (message?.type === "scan-status") reply(getState());
  });
  // Scrolling changes the current visible question even without a DOM mutation.
  let scrollPending = false;
  document.addEventListener(
    "scroll",
    () => {
      if (scrollPending || !running) return;
      scrollPending = true;
      requestAnimationFrame(() => {
        scrollPending = false;
        controller.refresh();
      });
    },
    { passive: true, capture: true },
  );
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) {
      const wasVision = settings.vision;
      settings = { ...defaults, ...changes.settings.newValue };
      if (wasVision && !settings.vision) stopVision();
      controller.update(settings);
      if (!wasVision && settings.vision && running && startClicked)
        startVision();
    }
  });
}
void start().catch((error) =>
  console.warn("[JEV-MCQ] Could not start overlay", error),
);
