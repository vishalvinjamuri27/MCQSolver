import type { Problem, Result } from "../solver/types";
export interface LLMProvider {
  solve(problem: Problem, signal?: AbortSignal): Promise<Result | null>;
}
