import { it, expect, vi } from "vitest";
import {
  decide,
  diffRatio,
  visionConfig,
  wordDelta,
  words,
  type ChangeState,
} from "../src/vision/change";
import { OpenAIProvider } from "../src/providers/openai";
const SIZE = 100_000;
// A frame with `changed` pixels flipped (as a fraction of the frame).
const frame = (changed = 0, offset = 0) => {
  const f = new Uint8Array(SIZE).fill(0);
  f.fill(255, offset, offset + Math.round(changed * SIZE));
  return f;
};
const { stableMs, intervalMs } = visionConfig;
const NEW = 1e9;
// Drives decide() through a settled screen and returns the decision once stable.
function settle(state: ChangeState, thumb: Uint8Array, t: number, text: number, force = false) {
  const first = decide(state, thumb, t, text, force);
  const second = decide(state, thumb, t + stableMs + 1, text, force);
  return first === "solve" ? first : second;
}
it("measures changed pixels and changed words", () => {
  expect(diffRatio(frame(), frame())).toBe(0);
  expect(diffRatio(frame(), frame(0.1))).toBeCloseTo(0.1);
  expect(diffRatio(frame(), new Uint8Array(10))).toBe(1);
  expect(wordDelta(words("Time 04:32 What is 2 + 3?"), words("Time 04:31 What is 2 + 3?"))).toBe(2);
  expect(wordDelta(words("What is 23 × 47? Question 3 of 10"), words("What is 31 × 58? Question 4 of 10"))).toBe(6);
});
it("waits for the screen to settle, then solves the first question once", () => {
  const state: ChangeState = { lastChangeAt: 0 };
  expect(decide(state, frame(), 1000, NEW)).toBe("wait");
  expect(decide(state, frame(), 1000 + intervalMs, NEW)).toBe("solve");
  expect(decide(state, frame(), 1000 + 2 * intervalMs, 0)).toBe("idle");
});
it("ignores hovers, timers and radio clicks but catches new questions", () => {
  let t = 0;
  const state: ChangeState = { lastChangeAt: 0 };
  expect(settle(state, frame(), (t += 5000), NEW)).toBe("solve");
  // Hover highlight on a choice row: visible change, no text change.
  expect(settle(state, frame(0.02), (t += 5000), 0)).toBe("idle");
  // Ticking timer: one or two words, tiny pixel change.
  expect(settle(state, frame(0.0003), (t += 5000), 2)).toBe("idle");
  // Only the numbers change: few pixels, but several words differ.
  expect(settle(state, frame(0.001), (t += 5000), 6)).toBe("solve");
  // Image/canvas question swaps with no text change: large pixel change.
  expect(settle(state, frame(0.2, 50_000), (t += 5000), 0)).toBe("solve");
  // Solve-now shortcut re-solves an unchanged screen.
  expect(settle(state, frame(0.2, 50_000), (t += 5000), 0, true)).toBe("solve");
});
it("does not solve while the page keeps moving", () => {
  const state: ChangeState = { lastChangeAt: 0 };
  for (let i = 0, t = 0; i < 10; i++, t += intervalMs)
    expect(decide(state, frame(i % 2 ? 0.1 : 0), t, NEW)).toBe("wait");
});
const reply = (value: unknown) =>
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
const read = {
  question: "Evaluate lim_(x→2) (x^2 − 4)/(x − 2)",
  choices: [
    { label: "A", text: "0" },
    { label: "B", text: "2" },
    { label: "C", text: "4" },
  ],
  answer: "4",
  choice: "C",
  confidence: 0.97,
};
it("sends the screenshot as an image and returns the question it read", async () => {
  const request = vi.fn().mockResolvedValue(reply(read));
  const result = await new OpenAIProvider("key", undefined, "low", request).solveImage(
    "data:image/jpeg;base64,AAAA",
  );
  expect(result).toEqual({
    problem: { question: read.question, choices: read.choices },
    result: { answer: "4", choice: "C", confidence: 0.97, solver: "llm" },
  });
  const body = JSON.parse(request.mock.calls[0][1].body);
  expect(body.input[0].content[1]).toEqual({
    type: "input_image",
    image_url: "data:image/jpeg;base64,AAAA",
    detail: "high",
  });
  expect(body.text.format.strict).toBe(true);
  expect(body.text.format.schema.required).toEqual([
    "question",
    "choices",
    "answer",
    "choice",
    "confidence",
  ]);
});
it.each([
  { ...read, question: "", answer: "?", choice: null, confidence: 0 },
  { ...read, confidence: 0.5 },
  { ...read, choice: "E" },
  { ...read, choices: [read.choices[0], read.choices[0]] },
  { ...read, choices: [], choice: "A" },
])("rejects unusable screenshot answers %#", async (value) => {
  const request = vi.fn().mockResolvedValue(reply(value));
  expect(
    await new OpenAIProvider("key", undefined, "low", request).solveImage("data:,"),
  ).toBeNull();
});
it("accepts free-response questions without choices", async () => {
  const request = vi
    .fn()
    .mockResolvedValue(reply({ ...read, choices: [], choice: null }));
  const result = await new OpenAIProvider("key", undefined, "low", request).solveImage(
    "data:,",
  );
  expect(result?.result).toMatchObject({ answer: "4", choice: null });
});
