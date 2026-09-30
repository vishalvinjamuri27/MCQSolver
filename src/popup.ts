import { defaults, type Settings } from "./config";
const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const status = (text: string) => {
  document.getElementById("status")!.textContent = text;
};
let settings: Settings = { ...defaults };
const scanStatus = (text: string) => {
  document.getElementById("scanStatus")!.textContent = text;
};
async function tabMessage(type: string) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw Error("No active tab");
  return chrome.tabs.sendMessage(tab.id, { type });
}
async function init() {
  settings = {
    ...defaults,
    ...(await chrome.storage.local.get("settings")).settings,
  };
  for (const key of [
    "enabled",
    "debug",
    "showLatency",
    "jevEnabled",
    "llmEnabled",
    "vision",
  ] as const)
    input(key).checked = settings[key];
  input("llmModel").value = settings.llmModel;
  input("reasoningEffort").value = settings.reasoningEffort;
  const { llmKey } = await chrome.storage.local.get("llmKey");
  if (llmKey)
    input("llmKey").placeholder = "Key saved on this device";
  const { jevKey } = await chrome.storage.local.get("jevKey");
  if (jevKey)
    input("jevKey").placeholder = "Key saved on this device";
  status(
    settings.llmEnabled && llmKey
      ? settings.jevEnabled && jevKey
        ? "LLM + Jev enabled"
        : "LLM enabled · Jev unavailable"
      : "Local arithmetic only · LLM answers need an API key",
  );
  const { lastProviderIssue } =
    await chrome.storage.session.get("lastProviderIssue");
  if (typeof lastProviderIssue === "string")
    document.getElementById("status")!.textContent +=
      ` · Last issue — ${lastProviderIssue}`;
  try {
    const current = await tabMessage("scan-status");
    if (current?.status) scanStatus(current.status);
  } catch {}
  const command = (await chrome.commands.getAll()).find(
    (c) => c.name === "toggle-overlay",
  );
  if (!command?.shortcut)
    document.getElementById("shortcut")!.textContent =
      "Set shortcut at chrome://extensions/shortcuts";
}
for (const key of ["enabled", "debug", "showLatency", "vision"] as const)
  input(key).addEventListener("change", () => {
    settings[key] = input(key).checked;
    void chrome.storage.local
      .set({ settings })
      .catch(() => status("Unable to save settings."));
  });
document.getElementById("activate")!.addEventListener("click", () => {
  scanStatus("Starting…");
  void (async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) throw Error();
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    // Content initialization loads settings asynchronously. Retry only this handshake.
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const current = await chrome.tabs.sendMessage(tab.id, {
          type: "start-scanning",
        });
        scanStatus(current.status);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw Error();
  })().catch(() =>
    scanStatus(
      "Cannot start here. Use a regular webpage, then refresh and try again.",
    ),
  );
});
document.getElementById("stop")!.addEventListener("click", () => {
  void tabMessage("stop-scanning")
    .then((current) => scanStatus(current.status))
    .catch(() => scanStatus("Not running on this page."));
});
document.getElementById("saveJev")!.addEventListener("click", () => {
  const enabled = input("jevEnabled").checked;
  // Request the provider origin only from this explicit user gesture.
  const permission = enabled
    ? chrome.permissions.request({ origins: ["https://api.typesafe.ai/*"] })
    : Promise.resolve(true);
  void permission
    .then(async (granted) => {
      if (!granted) {
        status("Permission declined. Local fallback is active.");
        input("jevEnabled").checked = false;
        settings.jevEnabled = false;
        await chrome.storage.local.set({ settings });
        return;
      }
      const key = input("jevKey").value.trim();
      if (enabled && key) await chrome.storage.local.set({ jevKey: key });
      if (!enabled) await chrome.storage.local.remove("jevKey");
      const stored = await chrome.storage.local.get("jevKey");
      settings.jevEnabled = enabled && Boolean(stored.jevKey);
      input("jevEnabled").checked = settings.jevEnabled;
      await chrome.storage.local.set({ settings });
      input("jevKey").value = "";
      status(
        settings.jevEnabled
          ? "Jev enabled. API errors fall back locally."
          : "Local fallback active. Add a key to enable Jev.",
      );
    })
    .catch(() =>
      status("Could not save Jev settings. Local arithmetic still works."),
    );
});
void init().catch(() =>
  status("Settings unavailable. Try reopening the popup."),
);

document.getElementById("saveLLM")!.addEventListener("click", () => {
  const enabled = input("llmEnabled").checked;
  const permission = enabled
    ? chrome.permissions.request({ origins: ["https://api.openai.com/*"] })
    : Promise.resolve(true);
  void permission
    .then(async (granted) => {
      if (!granted) {
        settings.llmEnabled = false;
        input("llmEnabled").checked = false;
        await chrome.storage.local.set({ settings });
        status("Permission declined. Local arithmetic is still available.");
        return;
      }
      const key = input("llmKey").value.trim();
      if (enabled && key) await chrome.storage.local.set({ llmKey: key });
      if (!enabled) await chrome.storage.local.remove("llmKey");
      const stored = await chrome.storage.local.get("llmKey");
      settings.llmEnabled = enabled && Boolean(stored.llmKey);
      settings.llmModel = input("llmModel").value.trim() || defaults.llmModel;
      settings.reasoningEffort = input("reasoningEffort")
        .value as Settings["reasoningEffort"];
      input("llmEnabled").checked = settings.llmEnabled;
      await chrome.storage.local.set({ settings });
      input("llmKey").value = "";
      status(
        settings.llmEnabled
          ? "LLM answers enabled. Enable Jev below to double-check choices."
          : "Local arithmetic only. Add an OpenAI key for LLM answers.",
      );
    })
    .catch(() => status("Unable to save LLM settings."));
});
