import { calculate, normalize } from "../parsing/arithmetic";
// Intentionally narrow, fully anchored rules: no substring math from word problems.
export function simpleMath(question: string): number | null {
  const q = normalize(question)
    .replace(/^(?:what is|calculate|evaluate|find)\s+/i, "")
    .replace(/[?=]\s*$/, "")
    .trim();
  let match = q.match(/^square root of\s+(.+)$/i);
  if (match) {
    const n = calculate(match[1]);
    return n !== null && n >= 0 ? Math.sqrt(n) : null;
  }
  match = q.match(/^([\d.]+)\s*%\s+of\s+([\d.]+)$/i);
  if (match) {
    const a = calculate(match[1]),
      b = calculate(match[2]);
    return a !== null && b !== null ? (a * b) / 100 : null;
  }
  // ax+b=c, with explicit or implicit coefficient, e.g. 2x + 3 = 11.
  match = q.match(
    /^(?:solve\s+)?([+-]?(?:\d+(?:\.\d+)?)?)\s*\*?\s*x\s*([+-]\s*\d+(?:\.\d+)?)?\s*=\s*([+-]?\d+(?:\.\d+)?)$/i,
  );
  if (match) {
    const a =
      match[1] === "" || match[1] === "+"
        ? 1
        : match[1] === "-"
          ? -1
          : Number(match[1]);
    const b = Number((match[2] ?? "0").replace(/\s/g, ""));
    return a !== 0 ? (Number(match[3]) - b) / a : null;
  }
  return q !== normalize(question) ? calculate(q) : null;
}
