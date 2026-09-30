import css from "./overlay.css";
import type { Result } from "../solver/types";
export class Overlay {
  readonly host = document.createElement("jev-mcq-overlay");
  private answer = document.createElement("div");
  private detail = document.createElement("div");
  private latency = document.createElement("div");
  private card = document.createElement("div");
  private enabled = true;
  private hasAnswer = false;
  constructor() {
    this.host.style.setProperty("pointer-events", "none", "important");
    const root = this.host.attachShadow({ mode: "open" }),
      style = document.createElement("style"),
      card = this.card;
    style.textContent = css;
    card.className = "card";
    this.answer.className = "answer";
    this.detail.className = "detail";
    this.latency.className = "latency";
    card.append(this.answer, this.detail, this.latency);
    root.append(style, card);
    document.documentElement.append(this.host);
    this.visibility();
  }
  private visibility() {
    this.host.style.setProperty(
      "display",
      this.enabled && this.hasAnswer ? "block" : "none",
      "important",
    );
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.visibility();
  }
  clear() {
    this.hasAnswer = false;
    this.visibility();
  }
  render(result: Result, ms: number, showLatency: boolean) {
    this.answer.textContent = result.choice ?? result.answer;
    this.detail.textContent = result.choice ? result.answer : "";
    this.detail.hidden = !result.choice;
    this.latency.textContent = `${ms.toFixed(1)} ms`;
    this.latency.hidden = !showLatency;
    this.hasAnswer = true;
    this.visibility();
  }
  /** Card bounds in viewport CSS pixels, or null while hidden. */
  bounds(): { x: number; y: number; width: number; height: number } | null {
    if (!this.enabled || !this.hasAnswer) return null;
    const { x, y, width, height } = this.card.getBoundingClientRect();
    return { x, y, width, height };
  }
  setLatency(ms: number) {
    this.latency.textContent = `${ms.toFixed(1)} ms`;
  }
  destroy() {
    this.host.remove();
  }
}
