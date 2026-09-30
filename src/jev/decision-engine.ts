export interface Option {
  label: string;
  text: string;
}
export interface Decision {
  choice: string;
  confidence: number;
}
export interface DecisionEngine {
  choose(
    prompt: string,
    options: Option[],
    signal?: AbortSignal,
  ): Promise<Decision | null>;
}
export class LocalDecisionEngine implements DecisionEngine {
  async choose(
    prompt: string,
    options: Option[],
    signal?: AbortSignal,
  ): Promise<Decision | null> {
    const found = options.filter((o) => o.text.trim() === prompt.trim());
    return found.length === 1
      ? { choice: found[0].label, confidence: 1 }
      : null;
  }
}
