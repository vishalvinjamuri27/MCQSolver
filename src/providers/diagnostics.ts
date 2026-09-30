// Records why an advanced solve returned "?" so the popup can show it. Never include keys.
export function reportIssue(source: string, detail: string) {
  const message = `${source}: ${detail.slice(0, 600)}`;
  console.warn(`[JEV-MCQ] ${message}`);
  if (typeof chrome !== "undefined")
    void chrome.storage?.session
      ?.set({ lastProviderIssue: message })
      .catch(() => {});
}
export function clearIssue() {
  if (typeof chrome !== "undefined")
    void chrome.storage?.session?.remove("lastProviderIssue").catch(() => {});
}
