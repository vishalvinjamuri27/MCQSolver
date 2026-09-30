import type { Problem, Result } from "../solver/types";
import { unknown } from "../solver/types";
import { Overlay } from "../overlay/overlay";
import { record, type Timing } from "../metrics/latency";
export interface ObservationOptions {
  extract: () => Problem | null;
  solve: (
    problem: Problem,
    onParsed: () => void,
    signal?: AbortSignal,
  ) => Result | Promise<Result>;
  onResult?: (result: Result) => void;
  debug: boolean;
  showLatency: boolean;
  enabled: boolean;
  /** Minimum gap between scans once a scan is slow (>8 ms). Fast pages always scan instantly. */
  throttleMs?: number;
}
export function observeProblems(options: ObservationOptions) {
  const overlay = new Overlay();
  overlay.setEnabled(options.enabled);
  let previous = "",
    generation = 0,
    disposed = false;
  let pending = new AbortController();
  const cache = new Map<string, Result>();
  function refresh(mutation = performance.now()) {
    try {
      const problem = options.extract();
      const key = problem ? JSON.stringify(problem) : "";
      if (key === previous) return;
      previous = key;
      pending.abort();
      pending = new AbortController();
      const version = ++generation;
      if (!problem) {
        overlay.clear();
        return;
      }
      const detected = performance.now();
      let parsed = detected;
      const show = (result: Result) => {
        try {
          if (disposed || version !== generation) return;
          // Re-read before showing asynchronous responses: the DOM may have moved on.
          if (JSON.stringify(options.extract()) !== key) return;
          const solved = performance.now();
          overlay.render(result, solved - mutation, options.showLatency);
          const rendered = performance.now();
          options.onResult?.(result);
          overlay.setLatency(rendered - mutation);
          const timing: Timing = {
            mutation,
            detected,
            parsed,
            solved,
            rendered,
          };
          record(
            problem.question,
            result.answer,
            result.solver,
            timing,
            options.debug,
          );
          if (result.confidence > 0) {
            cache.set(key, result);
            if (cache.size > 256) cache.delete(cache.keys().next().value!);
          }
        } catch (error) {
          if (version === generation) {
            previous = "";
            overlay.clear();
          }
          if (options.debug) console.warn("[JEV-MCQ] Render failed", error);
        }
      };
      const result =
        cache.get(key) ??
        options.solve(
          problem,
          () => {
            parsed = performance.now();
          },
          pending.signal,
        );
      if (result instanceof Promise) {
        overlay.render(unknown(), 0, options.showLatency);
        void result.then(show).catch(() => show(unknown()));
      } else show(result);
    } catch (error) {
      pending.abort();
      ++generation;
      previous = "";
      overlay.clear();
      if (options.debug) console.warn("[JEV-MCQ] Recoverable error", error);
    }
  }
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let lastScan = -Infinity,
    lastDuration = 0;
  const observer = new MutationObserver((records) => {
    const mutation = performance.now();
    if (
      !records.some(
        (r) => r.target !== overlay.host && !overlay.host.contains(r.target),
      )
    )
      return;
    const wait =
      lastDuration > 8 ? (options.throttleMs ?? 0) - (mutation - lastScan) : 0;
    const scan = () => {
      lastScan = performance.now();
      refresh(mutation);
      lastDuration = performance.now() - lastScan;
    };
    if (wait <= 0) scan();
    else if (scheduled === undefined)
      // Busy pages mutate constantly; coalesce into one trailing scan.
      scheduled = setTimeout(() => {
        scheduled = undefined;
        if (!disposed) scan();
      }, wait);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden"],
  });
  refresh();
  return {
    overlay,
    refresh,
    update(next: Partial<ObservationOptions>) {
      Object.assign(options, next);
      overlay.setEnabled(options.enabled);
      cache.clear();
      pending.abort();
      previous = "";
      ++generation;
      refresh();
    },
    stop() {
      pending.abort();
      disposed = true;
      clearTimeout(scheduled);
      ++generation;
      observer.disconnect();
      overlay.destroy();
    },
  };
}
