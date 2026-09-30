// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import { observeProblems } from "../src/content/observer";
import { extractDrill } from "../src/content/extractor";
import { calculate } from "../src/parsing/arithmetic";
import type { Result } from "../src/solver/types";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
let controller: ReturnType<typeof observeProblems> | undefined;
afterEach(() => {
  controller?.stop();
  document.body.innerHTML = "";
});
function setup() {
  document.body.innerHTML =
    '<div id="game"><div class="start"><span class="problem">13 × 7</span><input id="answer"></div></div>';
  const solve = vi.fn((p) => ({
    answer: String(calculate(p.question)),
    choice: null,
    confidence: 1,
    solver: "arithmetic" as const,
  }));
  controller = observeProblems({
    extract: extractDrill,
    solve,
    debug: false,
    showLatency: true,
    enabled: true,
  });
  return solve;
}
const answer = () =>
  document
    .querySelector("jev-mcq-overlay")
    ?.shadowRoot?.querySelector(".answer")?.textContent;
it("updates once per new question, ignores repeated mutations, caches repeats, never modifies input", async () => {
  const solve = setup();
  expect(answer()).toBe("91");
  const p = document.querySelector(".problem")!;
  p.textContent = "13 × 7";
  await tick();
  expect(solve).toHaveBeenCalledTimes(1);
  for (const value of ["1+1", "12+19", "92-37"]) {
    p.textContent = value;
    await tick();
    expect(answer()).toBe(String(calculate(value)));
  }
  expect(solve).toHaveBeenCalledTimes(4);
  p.textContent = "13 × 7";
  await tick();
  expect(solve).toHaveBeenCalledTimes(4);
  expect(answer()).toBe("91");
  expect((document.querySelector("#answer") as HTMLInputElement).value).toBe(
    "",
  );
  expect(controller!.overlay.host.style.pointerEvents).toBe("none");
});
it("survives replacement, hiding, session end and reappearance", async () => {
  setup();
  document.querySelector(".start")!.setAttribute("hidden", "");
  await tick();
  expect(controller!.overlay.host.style.display).toBe("none");
  document.querySelector("#game")!.innerHTML =
    '<div class="start"><span class="problem">96 ÷ 8</span></div>';
  await tick();
  expect(answer()).toBe("12");
  expect(controller!.overlay.host.style.display).toBe("block");
});
it("rejects stale asynchronous results", async () => {
  document.body.innerHTML =
    '<div id="game"><span class="problem">1+1</span></div>';
  let resolve!: (value: Result) => void;
  controller = observeProblems({
    extract: extractDrill,
    solve: () =>
      new Promise((r) => {
        resolve = r;
      }),
    debug: false,
    showLatency: false,
    enabled: true,
  });
  const old = resolve;
  document.querySelector(".problem")!.textContent = "2+2";
  await tick();
  old({ answer: "2", choice: null, confidence: 1, solver: "jev" });
  await tick();
  expect(answer()).toBe("?");
  resolve({ answer: "4", choice: null, confidence: 1, solver: "jev" });
  await tick();
  expect(answer()).toBe("4");
});
it("recovers after extractor errors", async () => {
  const extract = vi
    .fn()
    .mockImplementationOnce(() => {
      throw Error("broken");
    })
    .mockImplementation(extractDrill);
  document.body.innerHTML =
    '<div id="game"><span class="problem">1+1</span></div>';
  controller = observeProblems({
    extract,
    solve: () => ({
      answer: "2",
      choice: null,
      confidence: 1,
      solver: "arithmetic",
    }),
    debug: false,
    showLatency: false,
    enabled: true,
  });
  document.querySelector(".problem")!.textContent = "1+1";
  await tick();
  expect(answer()).toBe("2");
});
it("cancels old work and invalidates cache on configuration changes", async () => {
  document.body.innerHTML =
    '<div id="game"><span class="problem">1+1</span></div>';
  const signals: AbortSignal[] = [];
  const solve = vi.fn((_p, _parsed, signal) => {
    signals.push(signal);
    return {
      answer: "2",
      choice: null,
      confidence: 1,
      solver: "arithmetic" as const,
    };
  });
  controller = observeProblems({
    extract: extractDrill,
    solve,
    debug: false,
    showLatency: true,
    enabled: true,
  });
  document.querySelector(".problem")!.textContent = "2+2";
  await tick();
  expect(signals[0].aborted).toBe(true);
  controller.update({ showLatency: false });
  expect(solve).toHaveBeenCalledTimes(3);
  expect(
    controller.overlay.host
      .shadowRoot!.querySelector(".latency")!
      .hasAttribute("hidden"),
  ).toBe(true);
});
it("tracks 100 rapidly changing visible problems with exactly 100 solves", async () => {
  document.body.innerHTML =
    '<div id="game"><span class="problem"></span></div>';
  const solve = vi.fn((p) => ({
    answer: String(calculate(p.question)),
    choice: null,
    confidence: 1,
    solver: "arithmetic" as const,
  }));
  controller = observeProblems({
    extract: extractDrill,
    solve,
    debug: false,
    showLatency: false,
    enabled: true,
  });
  for (let i = 0; i < 100; i++) {
    document.querySelector(".problem")!.textContent = `${i}+1`;
    await tick();
  }
  expect(solve).toHaveBeenCalledTimes(100);
  expect(answer()).toBe("100");
});
it("contains errors during asynchronous completion", async () => {
  document.body.innerHTML =
    '<div id="game"><span class="problem">1+1</span></div>';
  let resolve!: (r: Result) => void;
  let broken = false;
  controller = observeProblems({
    extract: () => {
      if (broken) throw Error("lost DOM");
      return extractDrill();
    },
    solve: () => new Promise((r) => (resolve = r)),
    debug: false,
    showLatency: false,
    enabled: true,
  });
  broken = true;
  resolve({ answer: "2", choice: null, confidence: 1, solver: "llm" });
  await tick();
  expect(controller.overlay.host.style.display).toBe("none");
});
