export interface Timing {
  mutation: number;
  detected: number;
  parsed: number;
  solved: number;
  rendered: number;
}
export function record(
  question: string,
  answer: string,
  solver: string,
  t: Timing,
  debug: boolean,
) {
  const phases = {
    Detection: t.detected - t.mutation,
    Parsing: t.parsed - t.detected,
    Solve: t.solved - t.parsed,
    Render: t.rendered - t.solved,
    Total: t.rendered - t.mutation,
  };
  if (debug)
    console.debug(
      `[JEV-MCQ]\nQuestion: ${question}\nAnswer: ${answer}\nSolver: ${solver}\n` +
        Object.entries(phases)
          .map(([k, v]) => `${k}: ${v.toFixed(3)} ms`)
          .join("\n"),
      { timestamps: t },
    );
  return phases;
}
