import { JevDecisionEngine } from "./jev/client";
import { OpenAIProvider } from "./providers/openai";
import { solveAdvanced } from "./solver/advanced";
import { defaults, type Settings } from "./config";
import { reportIssue, clearIssue } from "./providers/diagnostics";
import { handleFrame, stopVision, validFrame } from "./vision/session";
import type { Choice, Problem } from "./solver/types";
chrome.commands.onCommand.addListener((command) => {
  if (command === "solve-now") void solveNow();
  if (command === "toggle-overlay")
    void chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (tab?.id) return chrome.tabs.sendMessage(tab.id, { type: "toggle" });
      })
      .catch(() => {});
});
// The shortcut grants activeTab, so it can inject the page script and capture on any site.
async function solveNow() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url ?? "")) return;
  const send = () =>
    chrome.tabs.sendMessage(tab.id!, { type: "vision-force" });
  try {
    await send();
  } catch {
    await chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ["content.js"] })
      .catch(() => {});
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      try {
        await send();
        return;
      } catch {}
    }
  }
}
const active = new Map<number, { id: string; controller: AbortController }>();
chrome.tabs.onRemoved.addListener((id) => {
  active.get(id)?.controller.abort();
  active.delete(id);
  stopVision(id);
});
// Live screenshot mode. Same sender checks as provider requests.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!["vision-frame", "vision-stop"].includes(message?.type)) return;
  const tab = sender.tab;
  if (
    sender.id !== chrome.runtime.id ||
    tab?.id === undefined ||
    !/^https?:/.test(sender.url ?? "")
  ) {
    reply({ ok: false, error: "not allowed on this page" });
    return;
  }
  if (message.type === "vision-stop") {
    stopVision(tab.id);
    reply({ ok: true });
    return;
  }
  // Capture only reads the window's active tab; skip while this tab is in the background.
  if (!tab.active || !validFrame(message)) {
    reply({ ok: true });
    return;
  }
  void handleFrame(tab.id, tab.windowId, message)
    .then(reply)
    .catch((error) => reply({ ok: false, error: String(error) }));
  return true;
});
const choicesValid = (options: unknown): options is Choice[] =>
  Array.isArray(options) &&
  options.length >= 2 &&
  options.length <= 6 &&
  options.every(
    (o: unknown) =>
      typeof o === "object" &&
      o !== null &&
      "label" in o &&
      "text" in o &&
      typeof o.label === "string" &&
      /^[A-F]$/.test(o.label) &&
      typeof o.text === "string" &&
      o.text.length > 0 &&
      o.text.length <= 2000,
  ) &&
  new Set(options.map((o) => o.label)).size === options.length;
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (
    !["jev-choose", "solve-advanced", "cancel-remote"].includes(message?.type)
  )
    return;
  const tab = sender.tab?.id;
  if (
    sender.id !== chrome.runtime.id ||
    tab === undefined ||
    !/^https?:/.test(sender.url ?? "") ||
    typeof message.requestId !== "string" ||
    message.requestId.length > 64
  ) {
    reply(null);
    return;
  }
  if (message.type === "cancel-remote") {
    if (active.get(tab)?.id === message.requestId) {
      active.get(tab)?.controller.abort();
      active.delete(tab);
    }
    reply(null);
    return;
  }
  const isJev = message.type === "jev-choose";
  const problem: Problem = message.problem;
  if (
    isJev
      ? typeof message.prompt !== "string" ||
        message.prompt.length > 8000 ||
        !choicesValid(message.options)
      : !problem ||
        typeof problem.question !== "string" ||
        problem.question.length > 8000 ||
        !choicesValid(problem.choices)
  ) {
    reply(null);
    return;
  }
  active.get(tab)?.controller.abort();
  const controller = new AbortController();
  active.set(tab, { id: message.requestId, controller });
  void (async () => {
    const stored = await chrome.storage.local.get([
      "settings",
      "jevKey",
      "llmKey",
    ]);
    const settings: Settings = { ...defaults, ...stored.settings };
    const { jevKey, llmKey } = stored;
    if (controller.signal.aborted) return null;
    const jev =
      settings.jevEnabled && typeof jevKey === "string" && jevKey
        ? new JevDecisionEngine(jevKey)
        : undefined;
    if (isJev)
      return (
        jev?.choose(message.prompt, message.options, controller.signal) ?? null
      );
    if (!settings.llmEnabled || typeof llmKey !== "string" || !llmKey) {
      reportIssue(
        "Setup",
        "LLM answers are off or no OpenAI key is saved. Re-enter the key and click Save.",
      );
      return null;
    }
    const result = await solveAdvanced(
      problem,
      new OpenAIProvider(llmKey, settings.llmModel, settings.reasoningEffort),
      jev,
      controller.signal,
    );
    if (result) clearIssue();
    return result;
  })()
    .then(reply)
    .catch(() => reply(null))
    .finally(() => {
      if (active.get(tab)?.id === message.requestId) active.delete(tab);
    });
  return true;
});
