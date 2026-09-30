import { observeProblems } from "../src/content/observer";
import { extractDrill, extractMCQ } from "../src/content/extractor";
import { createSolver } from "../src/solver/router";
const arithmetic = ["13 × 8", "8 + 17", "91 – 38", "84 ÷ 7", "13 × 9"];
const mcqs = [
  { question: "What is 6 × 4?", answers: ["12", "24", "30", "36"] },
  {
    question:
      "A fair coin is tossed 3 times. What is the probability of exactly 2 heads?",
    answers: ["1/8", "1/4", "3/8", "1/2"],
  },
  {
    question: "What is the determinant of the matrix [[2, 1], [3, 4]]?",
    answers: ["5", "8", "11", "-5"],
  },
  {
    question: "What is the derivative of x^3 + 2x?",
    answers: ["3x + 2", "3x^2 + 2", "x^2 + 2", "3x^2"],
  },
];
let mode = "arithmetic",
  index = 0,
  timer: ReturnType<typeof setInterval> | undefined;
function display() {
  document.getElementById("game")!.hidden = mode !== "arithmetic";
  document.getElementById("quiz")!.hidden = mode === "arithmetic";
  document
    .getElementById("arithmetic")!
    .classList.toggle("selected", mode === "arithmetic");
  document.getElementById("mcq")!.classList.toggle("selected", mode === "mcq");
  if (mode === "arithmetic")
    document.querySelector(".problem")!.textContent =
      arithmetic[index % arithmetic.length];
  else {
    const item = mcqs[index % mcqs.length];
    document.querySelector("[data-prompt]")!.textContent = item.question;
    document
      .querySelectorAll("[data-choice]")
      .forEach(
        (el, i) =>
          (el.textContent = `${String.fromCharCode(65 + i)}. ${item.answers[i]}`),
      );
  }
}
for (const name of ["arithmetic", "mcq"])
  document.getElementById(name)!.addEventListener("click", () => {
    mode = name;
    index = 0;
    display();
  });
document.getElementById("next")!.addEventListener("click", () => {
  index++;
  display();
});
document.getElementById("auto")!.addEventListener("click", () => {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  } else
    timer = setInterval(() => {
      index++;
      display();
    }, 500);
  document.getElementById("auto")!.textContent = timer
    ? "Stop rapid demo"
    : "Run rapid demo";
});
// Standalone preview uses the same observer/solver/overlay, not a fake screenshot.
// ?extension=1 disables this bootstrap so the actual extension can be tested.
if (
  !new URLSearchParams(location.search).has("extension") &&
  !document.querySelector("jev-mcq-overlay")
) {
  observeProblems({
    extract: () => extractDrill() ?? extractMCQ(),
    solve: createSolver(),
    debug: true,
    showLatency: true,
    enabled: true,
  });
}
