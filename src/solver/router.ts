import {
  parseArithmetic,
  evaluate,
  calculate,
  formatNumber,
} from "../parsing/arithmetic";
import { simpleMath } from "./symbolic";
import { unknown, type Problem, type Result } from "./types";
import type { DecisionEngine } from "../jev/decision-engine";
import type { LLMProvider } from "../providers/llm";
const equivalent = (a: number, b: number) =>
  Number.isSafeInteger(a) && Number.isSafeInteger(b)
    ? a === b
    : Math.abs(a - b) <=
      Number.EPSILON * 8 * Math.max(1, Math.abs(a), Math.abs(b));
export function createSolver(decision?: DecisionEngine, llm?: LLMProvider) {
  return function solve(
    problem: Problem,
    onParsed = () => {},
    signal?: AbortSignal,
  ): Result | Promise<Result> {
    const ast = parseArithmetic(problem.question);
    onParsed();
    const arithmetic = ast ? evaluate(ast) : null;
    const value = arithmetic ?? simpleMath(problem.question);
    const solver = arithmetic !== null ? "arithmetic" : "symbolic";
    if (
      value !== null &&
      Number.isFinite(value) &&
      Math.abs(value) <= Number.MAX_SAFE_INTEGER
    ) {
      const answer = formatNumber(value);
      if (!problem.choices.length)
        return { answer, choice: null, confidence: 1, solver };
      const matches = problem.choices.filter((c) => {
        const n = calculate(c.text);
        return n !== null && equivalent(n, value);
      });
      if (matches.length === 1)
        return { answer, choice: matches[0].label, confidence: 1, solver };
      if (matches.length > 1) return unknown();
      if (decision)
        return decision
          .choose(`Computed result: ${answer}`, problem.choices, signal)
          .then((d) =>
            d && problem.choices.some((c) => c.label === d.choice)
              ? {
                  answer,
                  choice: d.choice,
                  confidence: d.confidence,
                  solver: "jev" as const,
                }
              : unknown(),
          )
          .catch(unknown);
      return unknown();
    }
    if (llm)
      return llm
        .solve(problem, signal)
        .then((result) => {
          if (
            !result ||
            !Number.isFinite(result.confidence) ||
            result.confidence < 0.8 ||
            result.confidence > 1 ||
            typeof result.answer !== "string" ||
            result.answer.length > 160
          )
            return unknown();
          if (
            problem.choices.length &&
            !problem.choices.some((c) => c.label === result.choice)
          )
            return unknown();
          return { ...result, solver: "llm" as const };
        })
        .catch(unknown);
    return unknown();
  };
}
