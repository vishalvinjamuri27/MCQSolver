import { parseMCQ } from "../parsing/mcq";
import { mathText } from "./text";
import type { Problem } from "../solver/types";
export function visible(element: Element): boolean {
  // Native check avoids a getComputedStyle per ancestor on every call.
  if (typeof element.checkVisibility === "function")
    return (
      !element.closest('[hidden], [aria-hidden="true"]') &&
      element.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    );
  for (let e: Element | null = element; e; e = e.parentElement) {
    if (e.hasAttribute("hidden") || e.getAttribute("aria-hidden") === "true")
      return false;
    const s = getComputedStyle(e);
    if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0")
      return false;
  }
  return true;
}
// Timed arithmetic drills show a bare expression (e.g. "23 × 47") with no choices.
export function extractDrill(root: ParentNode = document): Problem | null {
  const el = root.querySelector("#game .problem");
  const question = el && visible(el) ? el.textContent?.trim() : "";
  return question ? { question, choices: [] } : null;
}

const clean = (el: Element) => mathText(el).replace(/\s+/g, " ").trim();
// Cheap first-text check so large containers are not fully serialized per call.
function startsWithLabel(el: Element): boolean {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(), i = 0; node && i < 20; node = walker.nextNode(), i++) {
    const text = node.textContent?.trim();
    if (text) return /^[A-F]/.test(text);
  }
  return false;
}
const labelled = (el: Element) =>
  startsWithLabel(el) && /^[A-F][.)：:]\s*\S/.test(clean(el));
// Page controls that must never be treated as answer choices.
const uiControl =
  /^((show|hide|toggle|view|open|close)\b.*|.*\b(view|mode|hint|hints|answer|solution|explanation)s?|next|prev(ious)?|back|submit|check|start|stop|continue|help|skip|flag|report|reset|clear|retry|restart|menu|settings|finish|done|ok|cancel)$/i;
const groupSelector =
  '[data-math-question], [data-question], fieldset, .question, .quiz-question, [role="radiogroup"], article';

function choiceElements(container: Element): Element[] {
  const explicit = Array.from(
    container.querySelectorAll(
      '[data-choice], label, [role="radio"], .option, .choice',
    ),
  ).filter(visible);
  for (const radio of container.querySelectorAll<HTMLInputElement>(
    'input[type="radio"]',
  )) {
    if (!visible(radio)) continue;
    for (const label of radio.labels ?? [])
      if (
        container.contains(label) &&
        visible(label) &&
        !explicit.includes(label)
      )
        explicit.push(label);
  }
  // Button/list choices and plain A/B/C text work without special site classes.
  if (!explicit.length) {
    const nodes = Array.from(
      container.querySelectorAll("button, li, p, div, span"),
    ).slice(0, 500);
    explicit.push(
      ...nodes.filter(
        (el) =>
          visible(el) &&
          labelled(el) &&
          !Array.from(el.children).some(labelled),
      ),
    );
  }
  if (!explicit.length) {
    explicit.push(
      ...Array.from(
        container.querySelectorAll('button,[role="option"]'),
      ).filter(
        (el) =>
          visible(el) &&
          clean(el) &&
          !uiControl.test(
            clean(el),
          ),
      ),
    );
  }
  return explicit.filter(
    (el) => !explicit.some((other) => other !== el && other.contains(el)),
  );
}
function questionText(container: Element, choices: Element[]): string {
  const prompt = container.querySelector(
    "[data-prompt], legend, .question-text",
  );
  if (prompt && visible(prompt)) return clean(prompt);
  // Read only text before the first choice. This retains multi-paragraph stems.
  const parts: string[] = [];
  function visit(node: Node): boolean {
    if (node === choices[0]) return false;
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      return true;
    }
    if (
      !(node instanceof Element) ||
      !visible(node) ||
      node.matches(
        "script,style,input,textarea,button,nav,header,footer,jev-mcq-overlay",
      )
    )
      return true;
    if (node.matches("math,.katex,mjx-container,sup,sub")) {
      parts.push(mathText(node));
      return true;
    }
    for (const child of node.childNodes) if (!visit(child)) return false;
    if (/^(P|DIV|H[1-6]|LEGEND)$/.test(node.tagName)) parts.push(" ");
    return true;
  }
  visit(container);
  return parts.join("").replace(/\s+/g, " ").trim();
}
export interface ScanResult {
  problem: Problem | null;
  count: number;
}
export function scanMCQ(root: ParentNode = document): ScanResult {
  // Stop scanning very large pages rather than freezing the tab.
  const deadline = performance.now() + 100;
  const candidates = new Set<Element>(
    Array.from(root.querySelectorAll(groupSelector)).slice(0, 100),
  );
  const anchors = Array.from(
    root.querySelectorAll(
      'input[type="radio"], [role="radio"], [data-choice], label, button, li, p, span, div',
    ),
  ).slice(0, 3000);
  for (const el of anchors) {
    if (performance.now() > deadline) break;
    if (
      !el.matches(
        'input[type="radio"], [role="radio"], [data-choice], button',
      ) &&
      (!labelled(el) || Array.from(el.children).some(labelled))
    )
      continue;
    let parent = el.parentElement;
    for (
      let depth = 0;
      parent &&
      depth < 5 &&
      parent !== document.body &&
      parent !== document.documentElement;
      depth++, parent = parent.parentElement
    )
      candidates.add(parent);
    if (candidates.size > 250) break;
  }
  const found: { problem: Problem; container: Element; choices: Element[] }[] =
    [];
  for (const container of candidates) {
    if (performance.now() > deadline) break;
    if (
      !visible(container) ||
      container.closest("nav,header,footer,jev-mcq-overlay")
    )
      continue;
    const choices = choiceElements(container);
    if (choices.length < 2 || choices.length > 6) {
      if (container.matches(groupSelector)) {
        const parsed = parseMCQ(
          (container as HTMLElement).innerText ?? container.textContent ?? "",
        );
        if (parsed) found.push({ problem: parsed, container, choices: [] });
      }
      continue;
    }
    const question = questionText(container, choices);
    if (!question || question.length > 8000) continue;
    const answers = choices.map((el, i) => {
      const text = clean(el),
        m = text.match(/^([A-F])[.)：:]\s*(.+)$/);
      return {
        label: m?.[1] ?? String.fromCharCode(65 + i),
        text: m?.[2] ?? text,
      };
    });
    if (
      answers.some((c) => !c.text || c.text.length > 2000) ||
      new Set(answers.map((c) => c.label)).size !== answers.length
    )
      continue;
    // Prefer the smallest container for the same physical choice group.
    const overlapping = found.findIndex(
      (item) =>
        item.choices.length === choices.length &&
        item.choices.every((el) => choices.includes(el)),
    );
    const item = {
      problem: { question, choices: answers },
      container,
      choices,
    };
    if (overlapping >= 0) {
      if (found[overlapping].container.contains(container))
        found[overlapping] = item;
    } else found.push(item);
  }
  // Scroll to one question on multi-question pages; never choose among visible groups.
  const onscreen = found.filter(({ container }) => {
    const r = container.getBoundingClientRect();
    return (
      (r.width === 0 && r.height === 0) ||
      (r.bottom > 0 &&
        r.top < innerHeight &&
        r.right > 0 &&
        r.left < innerWidth)
    );
  });
  const distinct = Array.from(
    new Map(
      onscreen.map((item) => [JSON.stringify(item.problem), item.problem]),
    ).values(),
  );
  return {
    problem: distinct.length === 1 ? distinct[0] : null,
    count: distinct.length,
  };
}
export function extractMCQ(root: ParentNode = document): Problem | null {
  return scanMCQ(root).problem;
}
