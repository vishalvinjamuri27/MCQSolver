import type { LLMProvider } from "../providers/llm";
import type { DecisionEngine } from "../jev/decision-engine";
import type { Problem, Result } from "./types";
import { reportIssue } from "../providers/diagnostics";
// The LLM answers the question. Jev independently selects the option matching that answer.
export async function solveAdvanced(
  problem: Problem,
  llm: LLMProvider,
  jev?: DecisionEngine,
  signal?: AbortSignal,
): Promise<Result | null> {
  const result = await llm.solve(problem, signal);
  if (!result || signal?.aborted) return null;
  if (!jev) return result;
  const decision = await jev.choose(
    `Question: ${problem.question}\nProposed answer: ${result.answer}`,
    problem.choices,
    signal,
  );
  if (signal?.aborted) return null;
  // A failed/unconfigured selector leaves the valid LLM answer usable.
  if (!decision) return result;
  // Disagreement is not evidence that Jev can correct the LLM's reasoning.
  if (decision.choice !== result.choice) {
    reportIssue(
      "Disagreement",
      `LLM chose ${result.choice}, Jev chose ${decision.choice}; answer suppressed`,
    );
    return null;
  }
  return {
    ...result,
    confidence: Math.min(result.confidence, decision.confidence),
    selector: "jev",
  };
}
