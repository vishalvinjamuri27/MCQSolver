// @vitest-environment jsdom
import { it, expect, afterEach, vi } from "vitest";
import { mathText } from "../src/content/text";
import { parseMCQ } from "../src/parsing/mcq";
import { extractMCQ, scanMCQ } from "../src/content/extractor";
import { createSolver } from "../src/solver/router";
afterEach(() => {
  document.body.innerHTML = "";
});
it("parses 2–6 labelled choices and rejects incomplete or duplicate choices", () => {
  expect(parseMCQ("What is 6 × 4?\nA. 12\nB. 24\nC. 30")?.choices[1]).toEqual({
    label: "B",
    text: "24",
  });
  for (const text of [
    "A. 2\nB. 3",
    "1+1\nA. 2",
    "1+1\nA. 2\nA. 3",
    "1+1\nA. 2\nB. 3\nfooter",
  ])
    expect(parseMCQ(text)).toBeNull();
});
it("extracts structured choices, ignores hidden duplicates, refuses multiple visible questions", () => {
  document.body.innerHTML =
    '<fieldset><legend>What is 6 × 4?</legend><label><input type="radio">A. 12</label><label><input type="radio">B. 24</label><label hidden>C. 10</label></fieldset>';
  expect(extractMCQ()).toEqual({
    question: "What is 6 × 4?",
    choices: [
      { label: "A", text: "12" },
      { label: "B", text: "24" },
    ],
  });
  document.body.innerHTML +=
    "<article><p>8+8?</p><div>A. 16</div><div>B. 20</div></article>";
  expect(extractMCQ()).toBeNull();
});
it("extracts plain block text with choices and omits hidden content", () => {
  document.body.innerHTML =
    '<div class="question"><p>1+1?</p><div>A. 2</div><div>B. 4</div><div hidden>C. 6</div></div>';
  expect(extractMCQ()?.choices).toHaveLength(2);
});
it("computes basic MCQs locally before considering remote providers", async () => {
  const choose = vi.fn(),
    llm = { solve: vi.fn() };
  const solve = createSolver({ choose }, llm);
  expect(
    await solve({
      question: "What is 6 × 4?",
      choices: [
        { label: "A", text: "12" },
        { label: "B", text: "24" },
      ],
    }),
  ).toMatchObject({ answer: "24", choice: "B", solver: "symbolic" });
  expect(choose).not.toHaveBeenCalled();
  expect(llm.solve).not.toHaveBeenCalled();
});
it.each([
  ["square root of 81", 9],
  ["25% of 80", 20],
  ["Solve 2x + 3 = 11", 4],
  ["x - 2 = 8", 10],
])("simple rule: %s", async (question, answer) => {
  expect(
    await createSolver()({ question: String(question), choices: [] }),
  ).toMatchObject({ answer: String(answer), solver: "symbolic" });
});
it("does not hallucinate results from arithmetic embedded in unsupported prose", async () => {
  expect(
    await createSolver()({
      question: "If I have 2 + 3 apples and give away 1, how many?",
      choices: [],
    }),
  ).toMatchObject({ answer: "?", confidence: 0 });
});
it("uses Jev only to map known results when local choice matching fails", async () => {
  const choose = vi.fn().mockResolvedValue({ choice: "B", confidence: 0.95 });
  expect(
    await createSolver({ choose })({
      question: "6*4",
      choices: [
        { label: "A", text: "twelve" },
        { label: "B", text: "twenty-four" },
      ],
    }),
  ).toMatchObject({ choice: "B", solver: "jev" });
  expect(choose).toHaveBeenCalledWith(
    "Computed result: 24",
    expect.any(Array),
    undefined,
  );
});
it("does not pick ambiguous equivalent answers", async () => {
  expect(
    await createSolver()({
      question: "1/2",
      choices: [
        { label: "A", text: ".5" },
        { label: "B", text: "2/4" },
      ],
    }),
  ).toMatchObject({ answer: "?" });
});
it("preserves superscripts, fractions, matrices and KaTeX annotations", () => {
  document.body.innerHTML =
    "<fieldset><legend>Derivative of x<sup>3</sup>?</legend><label>A. 3x<sup>2</sup></label><label>B. x</label></fieldset>";
  expect(extractMCQ()?.question).toBe("Derivative of x^(3)?");
  expect(extractMCQ()?.choices[0].text).toBe("3x^(2)");
  document.body.innerHTML =
    '<fieldset><legend>Evaluate <span class="katex"><annotation encoding="application/x-tex">\\int_0^1 x^2 dx</annotation></span></legend><label>A. <math><mfrac><mn>1</mn><mn>3</mn></mfrac></math></label><label>B. 1</label></fieldset>';
  expect(extractMCQ()?.question).toContain("\\int_0^1 x^2 dx");
  expect(extractMCQ()?.choices[0].text).toBe("((1)/(3))");
});
it("finds radio MCQs on arbitrary layouts without question classes", () => {
  document.body.innerHTML =
    '<main><section><h2>A fair coin is tossed three times.</h2><p>What is the probability of exactly two heads?</p><div><label><input type="radio" name="q">1/8</label><label><input type="radio" name="q">3/8</label></div></section></main>';
  expect(extractMCQ()).toEqual({
    question:
      "A fair coin is tossed three times. What is the probability of exactly two heads?",
    choices: [
      { label: "A", text: "1/8" },
      { label: "B", text: "3/8" },
    ],
  });
});
it("finds labelled buttons and plain list choices", () => {
  for (const choice of [
    "<button>A. 4</button><button>B. 8</button>",
    "<ul><li>A. 4</li><li>B. 8</li></ul>",
  ]) {
    document.body.innerHTML = `<main><section><p>What is 2+2?</p>${choice}</section></main>`;
    expect(extractMCQ()?.choices).toEqual([
      { label: "A", text: "4" },
      { label: "B", text: "8" },
    ]);
  }
});
it("finds unlabelled answer buttons but not navigation controls", () => {
  document.body.innerHTML =
    "<main><section><p>What is 2+2?</p><div><button>4</button><button>8</button><button>Next</button></div></section></main>";
  expect(extractMCQ()?.choices).toEqual([
    { label: "A", text: "4" },
    { label: "B", text: "8" },
  ]);
});
it("limits selection to a single onscreen question", () => {
  document.body.innerHTML =
    '<section id="one"><p>2+2?</p><button>A. 4</button><button>B. 8</button></section><section id="two"><p>3+3?</p><button>A. 6</button><button>B. 9</button></section>';
  vi.spyOn(
    document.getElementById("two")!,
    "getBoundingClientRect",
  ).mockReturnValue({
    top: 2000,
    bottom: 2200,
    left: 0,
    right: 300,
    width: 300,
    height: 200,
    x: 0,
    y: 2000,
    toJSON: () => ({}),
  });
  expect(extractMCQ()?.question).toBe("2+2?");
});
it("retains multiline text MCQs", () => {
  document.body.innerHTML = "<article>2+2?\nA. 4\nB. 8</article>";
  expect(extractMCQ()?.choices).toHaveLength(2);
});
it("reads and scans deeply nested pages in linear time", () => {
  let html = "<fieldset><legend>What is 2 + 3?</legend><label>A) 4</label><label>B) 5</label></fieldset>";
  for (let i = 0; i < 40; i++) html = `<div><span>x</span>${html}</div>`;
  document.body.innerHTML = html;
  const start = performance.now();
  expect(mathText(document.body)).toContain("What is 2 + 3?");
  expect(scanMCQ().problem?.choices.map((c) => c.text)).toEqual(["4", "5"]);
  expect(performance.now() - start).toBeLessThan(1000);
});
it("does not treat page controls as answer choices", () => {
  document.body.innerHTML =
    "<article><h1>Advanced Competitive Mathematics Quiz</h1><button>Text view</button><button>Show hint</button></article>";
  expect(extractMCQ()).toBeNull();
});
it("routes non-math multiple-choice questions to the LLM", async () => {
  document.body.innerHTML = `<fieldset><legend>Which city is the capital of Australia?</legend>
    <label><input type="radio" name="q"> A) Sydney</label>
    <label><input type="radio" name="q"> B) Canberra</label>
    <label><input type="radio" name="q"> C) Melbourne</label></fieldset>`;
  const problem = extractMCQ()!;
  expect(problem.question).toBe("Which city is the capital of Australia?");
  const llm = {
    solve: vi.fn().mockResolvedValue({
      answer: "Canberra",
      choice: "B",
      confidence: 0.99,
      solver: "llm",
    }),
  };
  expect(await createSolver(undefined, llm)(problem)).toMatchObject({
    answer: "Canberra",
    choice: "B",
    solver: "llm",
  });
  expect(llm.solve).toHaveBeenCalledWith(problem, undefined);
});
