export interface Settings {
  enabled: boolean;
  debug: boolean;
  showLatency: boolean;
  jevEnabled: boolean;
  llmEnabled: boolean;
  llmModel: string;
  reasoningEffort: "low" | "medium" | "high";
  /** Live screenshot mode: solve from screenshots instead of reading the page's HTML. */
  vision: boolean;
}
export const defaults: Settings = {
  enabled: true,
  debug: false,
  showLatency: true,
  jevEnabled: false,
  llmEnabled: false,
  llmModel: "gpt-5.4-mini",
  reasoningEffort: "low",
  vision: false,
};
export const jevConfig = {
  endpoint: "https://api.typesafe.ai/v1/systemone",
  model: "jev-latest",
  timeoutMs: 2500,
  minConfidence: 0.8,
};
export const llmConfig = {
  endpoint: "https://api.openai.com/v1/responses",
  model: "gpt-5.4-mini",
  timeoutMs: 20000,
  minConfidence: 0.8,
};
