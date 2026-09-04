import { describe, expect, it } from "vitest";
import { calculateEarningsCents, wouldExceedBudget } from "./payout";

describe("calculateEarningsCents", () => {
  it("floors partial thousands of views", () => {
    expect(calculateEarningsCents(1999, 250)).toBe(250);
    expect(calculateEarningsCents(2000, 250)).toBe(500);
  });

  it("returns 0 for zero views", () => {
    expect(calculateEarningsCents(0, 250)).toBe(0);
  });

  it("returns 0 for negative views", () => {
    expect(calculateEarningsCents(-100, 250)).toBe(0);
  });

  it("scales linearly with payout rate", () => {
    expect(calculateEarningsCents(5000, 100)).toBe(500);
    expect(calculateEarningsCents(5000, 400)).toBe(2000);
  });
});

describe("wouldExceedBudget", () => {
  it("returns false exactly at the budget boundary", () => {
    expect(wouldExceedBudget(9000, 1000, 10000)).toBe(false);
  });

  it("returns true when over budget by even 1 cent", () => {
    expect(wouldExceedBudget(9000, 1001, 10000)).toBe(true);
  });

  it("returns false when comfortably under budget", () => {
    expect(wouldExceedBudget(1000, 500, 10000)).toBe(false);
  });
});
