/**
 * Version policy. The minimums are the oldest releases this extension runs on.
 * The tested versions are the newest releases the maintainer ran the smoke
 * test on. A release newer than the tested one is accepted: it runs unless
 * the host or the Claude CLI changed an interface this extension uses, and the
 * smoke test (`npm run test:smoke`) is how a new release is checked.
 */
export const MIN_PI_VERSION = "0.99.1";
export const TESTED_PI_VERSION = "1.1.0";
export const MIN_CLAUDE_VERSION = "2.1.285";
export const TESTED_CLAUDE_VERSION = "2.1.296";

const VERSION = /(\d+)\.(\d+)\.(\d+)/;

/** Reads the first x.y.z in text, or undefined when there is none. */
export function parseVersion(
  text: string,
): [number, number, number] | undefined {
  const m = VERSION.exec(text);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

/** Negative when a is older than b, zero when equal, positive when newer. */
export function compareVersions(
  a: readonly number[],
  b: readonly number[],
): number {
  for (let i = 0; i < 3; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** True when text names a version at or above minimum. Unparseable text is not. */
export function atLeast(text: string, minimum: string): boolean {
  const have = parseVersion(text);
  const want = parseVersion(minimum);
  return (
    have !== undefined && want !== undefined && compareVersions(have, want) >= 0
  );
}
