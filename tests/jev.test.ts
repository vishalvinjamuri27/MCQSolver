import { it, expect, vi } from "vitest";
import { JevDecisionEngine } from "../src/jev/client";
const options = [
  { label: "A", text: "twelve" },
  { label: "B", text: "twenty-four" },
];
it("uses the official Choice schema and validates its response", async () => {
  const request = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          answers: {
            selection: { type: "choice", choice: "B", confidence: 0.95 },
          },
        }),
      ),
    );
  expect(
    await new JevDecisionEngine("test-key", request).choose(
      "Computed result: 24",
      options,
    ),
  ).toEqual({ choice: "B", confidence: 0.95 });
  const [url, init] = request.mock.calls[0];
  expect(url).toBe("https://api.typesafe.ai/v1/systemone");
  expect(JSON.parse(init.body).questions.selection).toMatchObject({
    type: "choice",
    criteria: { A: "twelve", B: "twenty-four" },
  });
});
it.each([
  { type: "choice", choice: "Z", confidence: 0.99 },
  { type: "choice", choice: "A", confidence: 0.1 },
  { type: "choice", choice: "A", confidence: 2 },
  { type: "choice", choice: "A", confidence: "1" },
  { type: "noul", choice: "A", confidence: 1 },
  {},
])("rejects invalid/uncertain Jev response %j", async (answer) => {
  const request = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ answers: { selection: answer } })),
    );
  expect(
    await new JevDecisionEngine("test-key", request).choose("24", options),
  ).toBeNull();
});
it("makes no request without a key and absorbs network errors", async () => {
  const request = vi.fn().mockRejectedValue(Error("network"));
  expect(
    await new JevDecisionEngine("", request).choose("24", options),
  ).toBeNull();
  expect(request).not.toHaveBeenCalled();
  expect(
    await new JevDecisionEngine("key", request).choose("24", options),
  ).toBeNull();
});
