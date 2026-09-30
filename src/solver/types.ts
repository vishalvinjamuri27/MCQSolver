export interface Choice {
  label: string;
  text: string;
}
export interface Problem {
  question: string;
  choices: Choice[];
}
export interface Result {
  answer: string;
  choice: string | null;
  confidence: number;
  solver: "arithmetic" | "symbolic" | "jev" | "llm";
  selector?: "jev";
}
export const unknown = (): Result => ({
  answer: "?",
  choice: null,
  confidence: 0,
  solver: "arithmetic",
});
