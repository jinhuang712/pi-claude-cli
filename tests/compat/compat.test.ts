import { describe, expect, it } from "vitest";
import {
  MIN_CLAUDE_VERSION,
  MIN_PI_VERSION,
  TESTED_CLAUDE_VERSION,
  TESTED_PI_VERSION,
  atLeast,
  compareVersions,
  parseVersion,
} from "../../src/compat.js";

describe("version policy", () => {
  it("reads the first x.y.z in text", () => {
    expect(parseVersion("2.1.296 (Claude Code)")).toEqual([2, 1, 296]);
    expect(parseVersion("v1.10.0")).toEqual([1, 10, 0]);
    expect(parseVersion("no version")).toBeUndefined();
  });
  it("compares numerically, not as text", () => {
    expect(compareVersions([1, 10, 0], [1, 9, 0])).toBeGreaterThan(0);
    expect(compareVersions([2, 1, 285], [2, 1, 285])).toBe(0);
    expect(compareVersions([0, 99, 1], [1, 0, 0])).toBeLessThan(0);
  });
  it("accepts the minimum and anything newer, and refuses older or unreadable", () => {
    expect(atLeast("0.99.1", MIN_PI_VERSION)).toBe(true);
    expect(atLeast("1.1.0", MIN_PI_VERSION)).toBe(true);
    expect(atLeast("2.0.0", MIN_PI_VERSION)).toBe(true);
    expect(atLeast("0.99.0", MIN_PI_VERSION)).toBe(false);
    expect(atLeast("2.1.284 (Claude Code)", MIN_CLAUDE_VERSION)).toBe(false);
    expect(atLeast("2.1.296 (Claude Code)", MIN_CLAUDE_VERSION)).toBe(true);
    expect(atLeast("garbage", MIN_CLAUDE_VERSION)).toBe(false);
  });
  it("keeps the tested versions at or above the minimums", () => {
    expect(atLeast(TESTED_PI_VERSION, MIN_PI_VERSION)).toBe(true);
    expect(atLeast(TESTED_CLAUDE_VERSION, MIN_CLAUDE_VERSION)).toBe(true);
  });
});
