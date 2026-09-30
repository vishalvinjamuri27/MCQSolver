// Read semantic math instead of flattening x² into x2 or a fraction into ab.
export function mathText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof Element)) return "";
  const tag = node.tagName.toLowerCase();
  const tex = node.querySelector('annotation[encoding="application/x-tex"]');
  if (tex) return ` ${tex.textContent ?? ""} `;
  if (tag === "script")
    return node.getAttribute("type")?.startsWith("math/tex")
      ? ` ${node.textContent ?? ""} `
      : "";
  if (
    node.matches(
      'style,input,textarea,jev-mcq-overlay,[hidden],[aria-hidden="true"]',
    )
  )
    return "";
  if (tag === "br") return "\n";
  // Visit each child once; re-visiting element children doubled the work per nesting level.
  const nodes = Array.from(node.childNodes);
  const children = nodes.map(mathText);
  const elements = children.filter((_, i) => nodes[i] instanceof Element);
  if (tag === "sup") return `^(${children.join("")})`;
  if (tag === "sub") return `_(${children.join("")})`;
  if (tag === "mfrac") return `((${elements[0]})/(${elements[1]}))`;
  if (tag === "msup") return `(${elements[0]})^(${elements[1]})`;
  if (tag === "msub") return `(${elements[0]})_(${elements[1]})`;
  if (tag === "msqrt") return `sqrt(${children.join("")})`;
  if (tag === "mtr") return `[${elements.join(", ")}]`;
  if (tag === "mtable") return `[${elements.join(", ")}]`;
  return children.join("");
}
