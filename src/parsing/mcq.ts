import type { Problem, Choice } from "../solver/types";
export function parseMCQ(text: string): Problem | null {
  if (text.length > 8000) return null;
  const lines = text
    .split(/\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  const first = lines.findIndex((x) => /^[A-F][.)：:]\s*\S/.test(x));
  if (first < 1) return null;
  const question = lines.slice(0, first).join(" "),
    choices: Choice[] = [];
  for (const line of lines.slice(first)) {
    const match = line.match(/^([A-F])[.)：:]\s*(.+)$/);
    if (!match) return null;
    choices.push({ label: match[1], text: match[2] });
  }
  if (
    choices.length < 2 ||
    choices.length > 6 ||
    new Set(choices.map((c) => c.label)).size !== choices.length
  )
    return null;
  return { question, choices };
}
