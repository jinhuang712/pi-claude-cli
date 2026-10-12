// Smoke test: runs this extension in a real pi with a real Claude login.
//
//   npm run test:smoke
//
// It spends a little subscription usage: two short prompts, about seven model
// calls. It starts pi in RPC mode with this checkout loaded, sends a
// multi-tool prompt and a follow-up prompt in the same pi process, then checks:
//   1. every model call ended without an error;
//   2. the files the prompts asked for have the right content;
//   3. one resident claude process served both prompts.
// It prints each call's time to first output, so a slow release shows up.
//
// Settings (environment):
//   PI_BIN            the pi executable (default: pi on PATH)
//   PI_CLAUDE_DRIVER  cli (default) or sdk
//   PI_SMOKE_MODEL    pi-claude-cli/<model> (default: pi-claude-cli/claude-sonnet-5)
//   PI_SMOKE_PAUSE_S  seconds between the prompts (default 5)
//   PI_SMOKE_CREDITS_URL  optional JSON URL; when set, the script reads the
//                     number at PI_SMOKE_CREDITS_PATH (a jq-like dotted path,
//                     default extraUsage.usedCredits) before and after and
//                     fails when it grows
import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PI = process.env.PI_BIN ?? "pi";
const MODEL = process.env.PI_SMOKE_MODEL ?? "pi-claude-cli/claude-sonnet-5";
const PAUSE_MS = Number(process.env.PI_SMOKE_PAUSE_S ?? "5") * 1000;
const CREDITS_URL = process.env.PI_SMOKE_CREDITS_URL;
const CREDITS_PATH =
  process.env.PI_SMOKE_CREDITS_PATH ?? "extraUsage.usedCredits";
const PROMPT_TIMEOUT_MS = 180_000;

const PROMPTS = [
  "Read notes.txt. Then create upper.txt with the same text in uppercase. " +
    "Then run `wc -c notes.txt upper.txt` and tell me both byte counts.",
  "Now append a third line, `DONE`, to upper.txt, then run `wc -l upper.txt` and tell me the line count.",
];

const failures = [];
const fail = (message) => failures.push(message);

function version(command) {
  const r = spawnSync(command, ["--version"], { encoding: "utf8" });
  return r.status === 0
    ? r.stdout.trim()
    : `unavailable (${r.error?.code ?? r.status})`;
}

async function credits() {
  if (!CREDITS_URL) return undefined;
  const res = await fetch(CREDITS_URL);
  let value = await res.json();
  for (const key of CREDITS_PATH.split(".")) value = value?.[key];
  return typeof value === "number" ? value : undefined;
}

/** PIDs of the descendants of root whose command is a claude executable. */
function claudeDescendants(root) {
  const out = spawnSync("ps", ["-axo", "pid=,ppid=,command="], {
    encoding: "utf8",
  }).stdout;
  const rows = out
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] }));
  const descendants = new Set([root]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const row of rows)
      if (descendants.has(row.ppid) && !descendants.has(row.pid)) {
        descendants.add(row.pid);
        changed = true;
      }
  }
  return rows
    .filter(
      (row) =>
        descendants.has(row.pid) && /(^|\/)claude( |$)/.test(row.command),
    )
    .map((row) => row.pid);
}

const home = mkdtempSync(join(tmpdir(), "pcc-smoke-"));
const work = join(home, "work");
const agentDir = join(home, "agent");
mkdirSync(work);
mkdirSync(agentDir);
writeFileSync(
  join(work, "notes.txt"),
  "The quick brown fox jumps over the lazy dog.\nPack my box with five dozen liquor jugs.\n",
);

console.log(
  `pi ${version(PI)}; claude ${version("claude")}; driver ${process.env.PI_CLAUDE_DRIVER ?? "cli"}; model ${MODEL}`,
);
const creditsBefore = await credits();

const child = spawn(
  PI,
  [
    "--mode",
    "rpc",
    "--no-session",
    "-ne",
    "-ns",
    "-np",
    "-nc",
    "-e",
    ROOT,
    "--model",
    MODEL,
  ],
  {
    cwd: work,
    env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
    stdio: ["pipe", "pipe", "pipe"],
  },
);
let stderr = "";
child.stderr.on("data", (chunk) => (stderr += chunk));

const lines = [];
let waiter;
let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  for (let i = buffer.indexOf("\n"); i !== -1; i = buffer.indexOf("\n")) {
    const line = buffer.slice(0, i);
    buffer = buffer.slice(i + 1);
    try {
      lines.push(JSON.parse(line));
    } catch {
      // not a protocol record
    }
  }
  waiter?.();
});
child.on("exit", () => waiter?.());

const next = async (deadline) => {
  while (lines.length === 0) {
    if (child.exitCode !== null)
      throw new Error(`pi exited early (${child.exitCode})`);
    if (Date.now() > deadline) throw new Error("timed out waiting for pi");
    await new Promise((res) => {
      waiter = res;
      setTimeout(res, 500);
    });
  }
  return lines.shift();
};

const pids = new Set();
const perPrompt = [];
try {
  for (const [index, prompt] of PROMPTS.entries()) {
    if (index > 0) await new Promise((res) => setTimeout(res, PAUSE_MS));
    child.stdin.write(
      `${JSON.stringify({ id: `p${index}`, type: "prompt", message: prompt })}\n`,
    );
    const deadline = Date.now() + PROMPT_TIMEOUT_MS;
    const calls = [];
    const seen = new Set();
    let turn;
    let first;
    for (;;) {
      const record = await next(deadline);
      const now = Date.now();
      if (record.type === "turn_start") {
        turn = now;
        first = undefined;
        for (const pid of claudeDescendants(child.pid)) seen.add(pid);
      } else if (
        record.type === "message_update" &&
        turn &&
        first === undefined
      ) {
        first = now;
        for (const pid of claudeDescendants(child.pid)) seen.add(pid);
      } else if (
        record.type === "message_end" &&
        record.message?.role === "assistant" &&
        turn
      ) {
        calls.push({
          first: first === undefined ? undefined : first - turn,
          total: now - turn,
          stop: record.message.stopReason,
          error: record.message.errorMessage,
        });
        turn = undefined;
      } else if (record.type === "agent_settled") break;
    }
    for (const pid of seen) pids.add(pid);
    perPrompt.push({ calls, pids: [...seen] });
  }
} catch (error) {
  fail(String(error.message ?? error));
} finally {
  child.stdin.end();
  setTimeout(() => child.kill("SIGKILL"), 15_000).unref();
}

perPrompt.forEach(({ calls }, index) => {
  console.log(`prompt ${index + 1}: ${calls.length} model calls`);
  calls.forEach((c, n) =>
    console.log(
      `  call ${n + 1}: first output ${c.first ?? "-"} ms, total ${c.total} ms, stop ${c.stop}${c.error ? `, error: ${c.error}` : ""}`,
    ),
  );
  calls.forEach((c, n) => {
    if (c.stop === "error" || c.error)
      fail(`prompt ${index + 1} call ${n + 1} failed: ${c.error ?? c.stop}`);
  });
  if (calls.length < 2)
    fail(
      `prompt ${index + 1} made ${calls.length} model calls; it needs tool use`,
    );
});

try {
  const upper = readFileSync(join(work, "upper.txt"), "utf8")
    .split("\n")
    .filter(Boolean);
  const expected = [
    "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG.",
    "PACK MY BOX WITH FIVE DOZEN LIQUOR JUGS.",
    "DONE",
  ];
  if (JSON.stringify(upper) !== JSON.stringify(expected))
    fail(`upper.txt is ${JSON.stringify(upper)}`);
} catch (error) {
  fail(`upper.txt: ${error.message}`);
}

if (pids.size !== 1)
  fail(
    `expected one resident claude process for both prompts, saw ${pids.size}: ${[...pids].join(", ") || "none"}`,
  );
else
  console.log(
    `one resident claude process (pid ${[...pids][0]}) served both prompts`,
  );

if (CREDITS_URL) {
  const after = await credits();
  console.log(`extra-usage credits: ${creditsBefore} -> ${after}`);
  if (creditsBefore === undefined || after === undefined)
    fail("could not read the extra-usage credits");
  else if (after > creditsBefore)
    fail(`extra-usage credits grew by ${after - creditsBefore}`);
}

if (failures.length > 0) {
  console.log(`\nFAIL\n- ${failures.join("\n- ")}`);
  if (stderr.trim())
    console.log(`\npi stderr (last 600 chars):\n${stderr.slice(-600)}`);
  console.log(`\nscratch kept at ${home}`);
  process.exit(1);
}
console.log("\nPASS");
rmSync(home, { recursive: true, force: true });
