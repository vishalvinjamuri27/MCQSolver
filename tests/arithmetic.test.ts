import { describe, it, expect } from "vitest";
import { calculate } from "../src/parsing/arithmetic";
describe("safe arithmetic", () => {
  it.each([
    ["1 + 1", 2],
    ["12 + 19", 31],
    ["92 - 37", 55],
    ["13 × 7", 91],
    ["13 * 7", 91],
    ["96 ÷ 8", 12],
    ["96 / 8", 12],
    ["0 × 999", 0],
    [" 8\u00a0 + 17 ", 25],
    ["91 − 38", 53],
    ["91 – 38", 53],
    ["-12 * -3", 36],
    ["2+3*4", 14],
    ["(2+3)*4", 20],
    ["-2^2", -4],
    ["2^3^2", 512],
    [".5 + .25", 0.75],
  ])("%s → %s", (input, expected) =>
    expect(calculate(String(input))).toBe(expected),
  );
  it.each([
    "",
    "hello",
    "1 +",
    "1/0",
    "1;alert(1)",
    "Math.random()",
    "2(3)",
    "1 2",
    "1..2",
    "(2+3",
    "2**3",
    "9^999",
    "1e3",
  ])("rejects %s", (input) => expect(calculate(input)).toBeNull());
});
