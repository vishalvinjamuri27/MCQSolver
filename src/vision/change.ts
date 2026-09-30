// Decides when the screen shows a new, settled question, from small grayscale
// thumbnails plus how many words of the page's visible text changed.
export const visionConfig = {
  /** How often the page asks for a frame. Chrome allows ~2 captures per second. */
  intervalMs: 600,
  /** The screen must hold still this long before a screenshot is solved. */
  stableMs: 500,
  /** Per-pixel brightness difference (0–255) that counts as a changed pixel. */
  pixelThreshold: 24,
  /** Changed-pixel fraction between consecutive frames that counts as "still moving". */
  motionRatio: 0.002,
  /** Words that must differ from the solved screen's text to count as a new question
   *  (a ticking timer or score changes only one or two). */
  textWords: 3,
  /** With that text change, any visible change beyond this fraction is a new question. */
  textPixelRatio: 0.0005,
  /** Without a text change (image/canvas questions, scrolling), this much must change.
   *  Hover highlights and selected radio buttons stay below it. */
  imagePixelRatio: 0.05,
  thumbWidth: 320,
};
export function diffRatio(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || !a.length) return 1;
  let changed = 0;
  for (let i = 0; i < a.length; i++)
    if (Math.abs(a[i] - b[i]) > visionConfig.pixelThreshold) changed++;
  return changed / a.length;
}
/** Number of words in one text but not the other (multiset symmetric difference). */
export function wordDelta(a: string[], b: string[]): number {
  const counts = new Map<string, number>();
  for (const w of a) counts.set(w, (counts.get(w) ?? 0) + 1);
  for (const w of b) counts.set(w, (counts.get(w) ?? 0) - 1);
  let delta = 0;
  for (const n of counts.values()) delta += Math.abs(n);
  return delta;
}
export const words = (text: string) => text.split(/\s+/).filter(Boolean);
export interface ChangeState {
  last?: Uint8Array;
  lastChangeAt: number;
  solved?: Uint8Array;
}
export type Decision = "wait" | "idle" | "solve";
/**
 * Updates state with a new thumbnail. `textDelta` is how many words of visible
 * page text differ from when the last screenshot was solved (Infinity if none was).
 * "solve" means: send this frame to the model now. `force` re-solves once settled.
 */
export function decide(
  state: ChangeState,
  thumb: Uint8Array,
  now: number,
  textDelta: number,
  force = false,
): Decision {
  if (!state.last || diffRatio(state.last, thumb) > visionConfig.motionRatio)
    state.lastChangeAt = now;
  state.last = thumb;
  if (now - state.lastChangeAt < visionConfig.stableMs) return "wait";
  const pixels = state.solved ? diffRatio(state.solved, thumb) : 1;
  const fresh =
    force ||
    !state.solved ||
    (textDelta >= visionConfig.textWords &&
      pixels > visionConfig.textPixelRatio) ||
    pixels > visionConfig.imagePixelRatio;
  if (!fresh) return "idle";
  state.solved = thumb;
  return "solve";
}
