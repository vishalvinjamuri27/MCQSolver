// Small recursive-descent grammar. No evaluation of JavaScript or page code.
export type Expression =
  | { kind: "number"; value: number }
  | { kind: "unary"; sign: number; child: Expression }
  | { kind: "binary"; op: string; left: Expression; right: Expression };
export function normalize(text: string): string {
  return text
    .replace(/[−–—]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}
export function parseArithmetic(text: string): Expression | null {
  const source = normalize(text);
  if (!source || source.length > 512) return null;
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/^]/g) ?? [];
  if (!tokens || tokens.join("") !== source.replace(/\s/g, "")) return null;
  let index = 0;
  const take = () => tokens[index++];
  function atom(): Expression {
    const t = take();
    if (t === "(") {
      const node = sum();
      if (take() !== ")") throw Error("parenthesis");
      return node;
    }
    if (!t || !/^(\d|\.)/.test(t)) throw Error("number");
    const value = Number(t);
    if (!Number.isFinite(value)) throw Error("finite");
    return { kind: "number", value };
  }
  function power(): Expression {
    let left = atom();
    if (tokens[index] === "^") {
      take();
      left = { kind: "binary", op: "^", left, right: unary() };
    }
    return left;
  }
  function unary(): Expression {
    if (tokens[index] === "+" || tokens[index] === "-")
      return { kind: "unary", sign: take() === "-" ? -1 : 1, child: unary() };
    return power();
  }
  function product(): Expression {
    let left = unary();
    while (tokens[index] === "*" || tokens[index] === "/")
      left = { kind: "binary", op: take(), left, right: unary() };
    return left;
  }
  function sum(): Expression {
    let left = product();
    while (tokens[index] === "+" || tokens[index] === "-")
      left = { kind: "binary", op: take(), left, right: product() };
    return left;
  }
  try {
    const result = sum();
    return index === tokens.length ? result : null;
  } catch {
    return null;
  }
}
export function evaluate(node: Expression): number | null {
  if (node.kind === "number") return node.value;
  if (node.kind === "unary") {
    const value = evaluate(node.child);
    return value === null ? null : node.sign * value;
  }
  const a = evaluate(node.left),
    b = evaluate(node.right);
  if (a === null || b === null || (node.op === "/" && b === 0)) return null;
  const n =
    node.op === "+"
      ? a + b
      : node.op === "-"
        ? a - b
        : node.op === "*"
          ? a * b
          : node.op === "/"
            ? a / b
            : a ** b;
  return Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER
    ? n
    : null;
}
export function calculate(text: string): number | null {
  const node = parseArithmetic(text);
  return node ? evaluate(node) : null;
}
export function formatNumber(n: number): string {
  return String(Number(n.toPrecision(12)));
}
