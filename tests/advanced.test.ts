import { it, expect, vi } from "vitest";
import { OpenAIProvider } from "../src/providers/openai";
import { solveAdvanced } from "../src/solver/advanced";
import type { Problem, Result } from "../src/solver/types";
const problem: Problem = {
  question: "What is the derivative of x^3?",
  choices: [
    { label: "A", text: "x^2" },
    { label: "B", text: "3x^2" },
  ],
};
const answer: Result = {
  answer: "3x^2",
  choice: "B",
  confidence: 0.96,
  solver: "llm",
};
const response = (value: unknown) =>
  new Response(
    JSON.stringify({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(value) }],
        },
      ],
    }),
  );
it("calls Responses with structured output and no tools, then validates answer", async () => {
  const request = vi.fn().mockResolvedValue(response(answer));
  expect(
    await new OpenAIProvider("test-key", "gpt-5.4-mini", "low", request).solve(
      problem,
    ),
  ).toEqual(answer);
  const [url, init] = request.mock.calls[0];
  expect(url).toBe("https://api.openai.com/v1/responses");
  const body = JSON.parse(init.body);
  expect(body.store).toBe(false);
  expect(body.tools).toBeUndefined();
  expect(body.text.format.strict).toBe(true);
  expect(body.reasoning.effort).toBe("low");
});
it.each([
  { ...answer, choice: "Z" },
  { ...answer, answer: "?" },
  { ...answer, confidence: 0.2 },
  { ...answer, confidence: 2 },
  { ...answer, answer: 42 },
])("rejects invalid output %j", async (value) => {
  const request = vi.fn().mockResolvedValue(response(value));
  expect(
    await new OpenAIProvider("key", undefined, "low", request).solve(problem),
  ).toBeNull();
});
it("handles no key, refusal, timeout and incomplete output", async () => {
  const request = vi.fn();
  expect(
    await new OpenAIProvider("", undefined, "low", request).solve(problem),
  ).toBeNull();
  expect(request).not.toHaveBeenCalled();
  for (const body of [
    { status: "incomplete" },
    {
      status: "completed",
      output: [
        { type: "message", content: [{ type: "refusal", refusal: "no" }] },
      ],
    },
  ]) {
    request.mockResolvedValue(new Response(JSON.stringify(body)));
    expect(
      await new OpenAIProvider("key", undefined, "low", request).solve(problem),
    ).toBeNull();
  }
  request.mockRejectedValue(Error("timeout"));
  expect(
    await new OpenAIProvider("key", undefined, "low", request).solve(problem),
  ).toBeNull();
});
it("cancels the provider fetch", async () => {
  const controller = new AbortController();
  const request = vi.fn(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) =>
        init.signal.addEventListener("abort", () => reject(Error("aborted"))),
      ),
  );
  const pending = new OpenAIProvider("key", undefined, "low", request).solve(
    problem,
    controller.signal,
  );
  controller.abort();
  expect(await pending).toBeNull();
  expect(request.mock.calls[0][1].signal.aborted).toBe(true);
});
it.each(["probability", "linear algebra", "calculus"])(
  "routes %s through LLM followed by Jev",
  async (topic) => {
    const llm = { solve: vi.fn().mockResolvedValue(answer) },
      jev = {
        choose: vi.fn().mockResolvedValue({ choice: "B", confidence: 0.92 }),
      };
    expect(
      await solveAdvanced(
        { ...problem, question: `A ${topic} question` },
        llm,
        jev,
      ),
    ).toMatchObject({
      answer: "3x^2",
      choice: "B",
      solver: "llm",
      selector: "jev",
      confidence: 0.92,
    });
    expect(jev.choose).toHaveBeenCalledWith(
      expect.stringContaining("Proposed answer: 3x^2"),
      problem.choices,
      undefined,
    );
  },
);
it("uses LLM fallback if Jev is unavailable, but suppresses disagreements", async () => {
  const llm = { solve: vi.fn().mockResolvedValue(answer) };
  expect(
    await solveAdvanced(problem, llm, {
      choose: vi.fn().mockResolvedValue(null),
    }),
  ).toEqual(answer);
  expect(
    await solveAdvanced(problem, llm, {
      choose: vi.fn().mockResolvedValue({ choice: "A", confidence: 0.9 }),
    }),
  ).toBeNull();
});
it("calls the global fetch unbound so Chrome does not throw Illegal invocation", async () => {
  const receivers: unknown[] = [];
  vi.stubGlobal("fetch", function (this: unknown) {
    receivers.push(this);
    return Promise.resolve(new Response("{}", { status: 500 }));
  });
  await new OpenAIProvider("key").solve(problem);
  const { JevDecisionEngine } = await import("../src/jev/client");
  await new JevDecisionEngine("key").choose("x", problem.choices);
  vi.unstubAllGlobals();
  expect(receivers).toHaveLength(2);
  for (const receiver of receivers)
    expect(receiver === undefined || receiver === globalThis).toBe(true);
});
