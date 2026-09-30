// Content-script transport only. Provider credentials stay in the service worker.
export async function remote<T>(
  message: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T | null> {
  if (signal?.aborted) return null;
  const requestId = crypto.randomUUID();
  const cancel = () => {
    void chrome.runtime
      .sendMessage({ type: "cancel-remote", requestId })
      .catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    return await chrome.runtime.sendMessage({ ...message, requestId });
  } catch {
    return null;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}
