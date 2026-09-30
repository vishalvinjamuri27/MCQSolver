import { afterEach, beforeEach, expect, it, vi } from "vitest";
let listener: (
  message: any,
  sender: any,
  reply: (result: unknown) => void,
) => unknown;
let settings: Record<string, unknown>;
let keys: Record<string, unknown>;
const sender = {
  id: "unit-extension",
  tab: { id: 1 },
  url: "https://example.com/math",
};
const request = {
  type: "solve-advanced",
  requestId: "request-1",
  problem: {
    question: "Derivative of x^3?",
    choices: [
      { label: "A", text: "x^2" },
      { label: "B", text: "3x^2" },
    ],
  },
};
const replyBody = {
  status: "completed",
  output: [
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text: JSON.stringify({
            answer: "3x^2",
            choice: "B",
            confidence: 0.98,
          }),
        },
      ],
    },
  ],
};
beforeEach(async () => {
  vi.resetModules();
  settings = {
    llmEnabled: true,
    jevEnabled: true,
    llmModel: "gpt-5.4-mini",
    reasoningEffort: "low",
  };
  keys = { llmKey: "test-llm-key", jevKey: "test-jev-key" };
  vi.stubGlobal("chrome", {
    runtime: {
      id: sender.id,
      onMessage: { addListener: vi.fn((fn) => (listener = fn)) },
    },
    commands: { onCommand: { addListener: vi.fn() } },
    tabs: { onRemoved: { addListener: vi.fn() }, query: vi.fn() },
    storage: {
      local: { get: vi.fn(async () => ({ settings, ...keys })) },
    },
  });
  await import("../src/background");
});
afterEach(() => vi.unstubAllGlobals());
it("routes a content message through LLM and Jev without returning keys", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(replyBody)))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          answers: {
            selection: { type: "choice", choice: "B", confidence: 0.91 },
          },
        }),
      ),
    );
  vi.stubGlobal("fetch", fetch);
  const result = await new Promise((resolve) =>
    expect(listener(request, sender, resolve)).toBe(true),
  );
  expect(result).toMatchObject({
    answer: "3x^2",
    choice: "B",
    selector: "jev",
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(result)).not.toContain("test-");
});
it("blocks remote requests from other extensions, non-web pages, and malformed messages", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  for (const source of [
    { ...sender, url: "chrome-extension://abc/page.html" },
    { ...sender, id: "another-extension" },
  ]) {
    const reply = vi.fn();
    listener(request, source, reply);
    expect(reply).toHaveBeenCalledWith(null);
  }
  const reply = vi.fn();
  listener(
    { ...request, problem: { question: "hi", choices: [] } },
    sender,
    reply,
  );
  expect(reply).toHaveBeenCalledWith(null);
  expect(fetch).not.toHaveBeenCalled();
});
it("has a no-network fallback without configured keys", async () => {
  keys = {};
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const result = await new Promise((resolve) =>
    listener(request, sender, resolve),
  );
  expect(result).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it("cancels an older request without allowing its cancel message to abort the newer one", async () => {
  settings.jevEnabled = false;
  const signals: AbortSignal[] = [];
  const fetch = vi.fn((_url, init) => {
    signals.push(init.signal);
    return new Promise<Response>((_resolve, reject) =>
      init.signal.addEventListener("abort", () => reject(Error("cancelled"))),
    );
  });
  vi.stubGlobal("fetch", fetch);
  const first = new Promise((resolve) => listener(request, sender, resolve));
  await vi.waitFor(() => expect(signals).toHaveLength(1));
  const second = new Promise((resolve) =>
    listener({ ...request, requestId: "request-2" }, sender, resolve),
  );
  await vi.waitFor(() => expect(signals).toHaveLength(2));
  expect(signals[0].aborted).toBe(true);
  listener({ type: "cancel-remote", requestId: "request-1" }, sender, () => {});
  expect(signals[1].aborted).toBe(false);
  listener({ type: "cancel-remote", requestId: "request-2" }, sender, () => {});
  expect(signals[1].aborted).toBe(true);
  expect(await first).toBeNull();
  expect(await second).toBeNull();
});
