// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
it("starts, stops, resumes and reports the tab scanner without modifying page inputs", async () => {
  document.body.innerHTML =
    '<section><p>What is 2+2?</p><label>A. 4</label><label>B. 8</label><input id="untouched"></section>';
  let listener: (
    message: unknown,
    sender: unknown,
    reply: (r: any) => void,
  ) => void = () => {};
  vi.stubGlobal("chrome", {
    storage: {
      local: { get: vi.fn().mockResolvedValue({}) },
      onChanged: { addListener: vi.fn() },
    },
    runtime: { onMessage: { addListener: vi.fn((fn) => (listener = fn)) } },
  });
  await import("../src/content/content");
  await vi.waitFor(() =>
    expect(
      document
        .querySelector("jev-mcq-overlay")
        ?.shadowRoot?.querySelector(".answer")?.textContent,
    ).toBe("A"),
  );
  const reply = vi.fn();
  listener({ type: "stop-scanning" }, {}, reply);
  expect(reply).toHaveBeenLastCalledWith({
    running: false,
    status: "Stopped on this page.",
  });
  expect(
    (document.querySelector("jev-mcq-overlay") as HTMLElement).style.display,
  ).toBe("none");
  document.querySelector("p")!.textContent = "What is 4+4?";
  await new Promise((r) => setTimeout(r, 0));
  expect(
    (document.querySelector("jev-mcq-overlay") as HTMLElement).style.display,
  ).toBe("none");
  listener({ type: "start-scanning" }, {}, reply);
  expect(reply.mock.lastCall?.[0].running).toBe(true);
  expect(
    document
      .querySelector("jev-mcq-overlay")
      ?.shadowRoot?.querySelector(".answer")?.textContent,
  ).toBe("B");
  expect((document.querySelector("#untouched") as HTMLInputElement).value).toBe(
    "",
  );
  listener({ type: "stop-scanning" }, {}, reply);
  vi.unstubAllGlobals();
});
