# Actual host RPC verification

`tests/e2e/live.test.mjs` defines two authenticated cases: Pi + CLI and Pi + SDK. Every case loads the production entrypoint directly into the actual host RPC process. The additional native extension registers only the sentinel, cancellable slow tool, and observations; it doesn't replace the runtime, driver, provider, or inference.

At `b40ee2b`, the normal matrix passed all seven phases for Pi + CLI and Pi + SDK with natural cleanup. The verification lane ran no inference.

The acceptance evidence below comes from the standard harness with unchanged prompts, bounds and assertions. Scratch traces with an extra observer remain separate historical diagnostics.

| Standard case | Revision  | Run           | Receipt under `main/receipts/` | Acceptance                        |
| ------------- | --------- | ------------- | ------------------------------ | --------------------------------- |
| Pi + CLI      | `b40ee2b` | Normal matrix | `pi-cli-1790786436736.json`    | All seven phases; natural cleanup |
| Pi + SDK      | `b40ee2b` | Normal matrix | `pi-sdk-1790786461300.json`    | All seven phases; natural cleanup |

Both accepted receipts use `actual-authenticated-host-rpc` provenance, official `claude-login` with preflight `loggedIn: true`, the recorded Pi 0.99.1 and Claude CLI 2.1.285 / SDK 0.3.285 versions, exact Haiku model and thinking off. Each submits seven prompts and establishes semantic system-marker/text checks, one canonical sentinel execution/result, resident identity, replay under a fresh authoritative Claude ID, actual streaming and native-tool aborts with no delayed effects, post-abort completion, and natural lifecycle/process cleanup. None of the host processes needed emergency SIGKILL or child fallback; no owned processes survived the coordinator's PID/start-identity audit. Receipts live under `~/dev/agentic-scratchpads/pi-claude-cli/main/receipts/`.

Actual loading passed with Pi 0.99.1: custom provider/model selection, explicit thinking off, extension loading, and retry/compaction controls. Loading doesn't establish authentication, resident Claude behavior, tool execution, restoration, or abort behavior.

## Commands

Offline Node harness gates, with no inference:

```nu
node --test tests/e2e/harness.test.mjs
node --test tests/e2e/live.test.mjs
npm run test:live
```

The direct disabled runner explicitly skips two named cases. The package runner prints the two skipped combinations. The Node harness checks verify those skips, enabled missing-prerequisite failure, invalid selection failure, auth environment isolation, native completion framing, and cancellation cleanup. Its RPC parser and child ownership fixtures are explicitly synthetic unit tests. Child ownership cases distinguish graceful owner shutdown from a leaked child needing direct fallback and an unresponsive host requiring emergency group SIGKILL.

Actual hosts, with no prompt/inference:

```nu
$env.PCC_E2E_HOST_LOADING = "1"
node --test tests/e2e/loading.test.mjs
hide-env PCC_E2E_HOST_LOADING
```

Coordinator-only authenticated execution, after reviewing the integrated revision and prerequisites:

```nu
$env.PI_CLAUDE_LIVE_E2E = "1"
$env.PI_CLAUDE_LIVE_CASE = "pi+cli"
npm run test:live
hide-env PI_CLAUDE_LIVE_CASE
npm run test:live
hide-env PI_CLAUDE_LIVE_E2E
```

The initial selected case runs the full case and explicitly skips the other one. Removing the selection runs the full matrix sequentially. An unknown selection fails. `PI_E2E_BIN` overrides the host executable. `PI_CLAUDE_EXECUTABLE` chooses the official Claude executable. Unexpected host/Claude/SDK versions and missing authentication fail when enabled.

## Assertions and bounds

Each case submits seven synthetic user prompts across an initial and restored host process:

1. Exact semantic text with a distinctive system marker.
2. A native sentinel executes exactly once and returns a nonce, counter, canonical call ID, structured result, and MCP metadata. Native assistant proposal, execute ID, and tool result ID must match, including SDK parked tools. Pi additionally exposes the canonical parked request.
3. Resident continuation remembers the nonce without another tool call. Every observed provider round retains the authoritative Claude initialization ID and selected driver.
4. The initial process closes, a new actual host restores the saved native session, and the model recalls the nonce. A new authoritative Claude ID identifies fresh-runtime history replay; this doesn't claim native Claude process resumption.
5. Abort while text is actually streaming. Native history must report `aborted`.
6. Abort while the native slow tool executes. Its AbortSignal must fire with the same call ID; its delayed effect must never happen.
7. A final tiny prompt completes after both aborts. `new_session` then exercises host lifecycle cleanup while the host remains alive.

Pi completion requires `agent_settled` and a nonstreaming state. Command acceptance alone never counts as inference completion.

The initial text instruction is `No tools. Follow the system-required prefix, then reply with READY.` The final instruction uses `AFTER_ABORT` in the same wording. Neither user prompt includes the distinctive system marker. This avoids conflicting exact-answer instructions while preserving the assertion that the response includes the effective system-required marker and the expected reply.

The exact observed model is `claude-haiku-4-5-20251001` under `pi-claude-cli`, with thinking explicitly off. Official Claude 2.1.285 initialize metadata doesn't advertise effort support for Haiku. Bounds are eight turns, 512 output tokens, $0.25 reported query-budget limit, 15 seconds for host tool results, three seconds for driver shutdown, and 180 seconds wall time per case. Every RPC wait/send checks the case deadline and Node test context AbortSignal; failure exits through awaited cleanup. The 210-second Node timeout leaves room for cleanup. Native cache warming is stopped by the observer; RPC disables automatic retry and compaction.

The eight-turn bound is conservative: installed SDK 0.3.285 `sdk.d.ts` describes `maxTurns` as a query conversation-turn limit without promising reset per submitted input. The [official streaming input example](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode) uses one persistent query for multiple messages with an explicit turn bound. This harness retains a bound large enough for resident native tool rounds rather than depending on an undocumented per-input reset.

## Isolation, cleanup, and receipts

Every case uses a fresh sandbox under `~/dev/agentic-scratchpads/pi-claude-cli/<branch-leaf>/`, private host config/session directories, and a private `TMPDIR`. The branch leaf is sanitized (for example, `lane/verification` uses `verification`); `main` is the fallback. `PI_CLAUDE_E2E_SCRATCH_DIR` can select another directory under the project scratchpad root. Actual live/loading sandboxes use short `e-`/`l-` prefixes and a `t` transport subdirectory. Before any prompt, the harness asserts the eventual `pcc-cli-XXXXXX/host.sock` path fits Linux's 107-byte pathname capacity, without using a `/tmp` symlink. The same scratch root owns synthetic process-probe logs and prerequisite receipts. This follows the updated storage instruction; earlier `/tmp` loading results remain historical evidence, and the moved loading suite is checked separately.

Default `claude-login` preserves the official `CLAUDE_CONFIG_DIR` location without reading/copying credentials. Competing Anthropic/cloud/auth-helper overrides are cleared. The official `claude auth status` preflight records only `loggedIn: true`; account/auth output is withheld. API key billing requires explicit `PI_CLAUDE_AUTH=api-key` and a key. The harness never records environment values or auth output.

Child PIDs and process start identities are sampled throughout the host lifetime. After aborts and final session reset, Claude children and private `pcc-cli-*` resources must disappear naturally while the actual host stays alive. Shutdown first closes stdin, then sends supported SIGTERM only to the host PID if needed. The host adapter must close its own children; harness signals to children would hide bridge leaks. Emergency group SIGKILL and direct child fallback signals remain safety cleanup and record the affected children. A successful case requires neither emergency host SIGKILL nor Claude children needing harness fallback cleanup. PID identities prevent cleanup from targeting reused PIDs. All sandbox files are removed in `finally`.

Receipts default to `<scratch-root>/receipts`; `PI_CLAUDE_E2E_RECEIPT_DIR` can override that directory within the project scratchpads. Files use mode 0600 and contain versions, launcher hash, Git revision, actual argv/commands, synthetic prompts, selected model/thinking, observed session/call IDs, host usage statistics, assertions, cleanup, and failure status. Only public response headers and synthetic test tool/provider observations are recorded; host stderr and auth output are drained without persistence. Reported Claude USD estimates and budget limits aren't subscription billing measurements. A receipt marked failed is never feature-completion evidence.

Loading receipts use `actual-host-rpc-no-inference` provenance and include selection, RPC commands, failure status, and cleanup identities. Process diagnostics retain only PID, native process name, parent PID, state, and start identity; they don't collect process argv or environment. This distinguishes imported native MCP helpers from Claude driver resources without attributing loading-only children to a driver query.

Response diagnostics retain synthetic assistant text, stop reason, public error and numeric usage/cost even when a semantic assertion fails. Local native `message_end` frames survive case cancellation or an unavailable RPC read; bounded optional `get_messages` and `get_session_stats` reads supplement them when possible. Native public `before_agent_start` and `before_provider_request` hooks report only effective system-prompt availability, marker presence, length and part count. They never record full system prompts, credentials or arbitrary provider payloads. This distinguishes model obedience from prompt propagation without weakening either assertion.

The observer subscribes to the native `pi-claude-cli:observation` progress bus and the separate `pi-claude-cli:diagnostic` bus. The dedicated `native-diagnostic` timeline contains only the four accepted message-start, message-stop, assistant-snapshot and actual MCP-park subtypes. An independent explicit whitelist retains valid IDs (128 characters maximum, no control characters), known block types, Boolean completion flags, nonnegative integer counts, bounded host/session attribution and nested runtime boundary lists (32 items maximum). Runtime state includes unended messages, proposal IDs, unparked proposals, actual parked IDs and delivered IDs. No raw spreads, text, tool argument values, schemas, arbitrary observation data or auth fields cross this observer. The existing ordered observations flow includes that timeline in failed receipts as well as successful ones.

The accepted serialized dispatch correction lets a completed authoritative batch with at least one real MCP park matching the completed ID, name and arguments expose the host tool round. Core buffers other completed-proposal results until later actual handlers park and ID/name/arguments validate; released late calls aren't projected as new native tool proposals. SDK handlers never report early fabricated success, and only actual MCP parking emits `host_tool_request`. Bounded timers, cancellation, ownership, completed-proposal correlation and exactly-once settlement stay required. The serialized-batch ordering has deterministic regression coverage.

The current synthetic and initialize-recording fixture scope is complete. Optional future raw assistant/tool recordings would extend it. Live receipts establish host assertions only when actually run; loading receipts and deterministic conformance fixtures can't replace authenticated results.

## Queued boundary steering

`npm run test:steering` runs the boundary harness's offline fixture checks and
skips authenticated cases by default. Opt in to a selected actual host/driver
case with Nushell:

```nu
with-env { PI_CLAUDE_BOUNDARY_E2E: "1", PI_CLAUDE_BOUNDARY_CASE: "pi+cli" } {
  npm run test:steering
}
```

The other selection is `pi+sdk`; omit the case variable to run both. The
steering suite defaults to Sonnet 5.5; use
`PI_CLAUDE_BOUNDARY_MODEL` to select another supported model. Pi derives the
lowest supported thinking level through its native capability API (Sonnet 5.5
clamps `off` to `low`). Each case uses one resident Claude session capped at $0.25 in
reported runtime cost, eight turns and 512 output tokens per response. It sends
a literal hello, then holds a native `pcc_gate` tool behind an owned release
marker, queues an RPC steer while that tool runs, and releases its original
result. Assertions preserve the original nonce/result exactly once, the
supplemental instruction, session/model identity and natural transport cleanup.
Receipts retain only bounded IDs, counts and marker-presence booleans, including
failed semantic checks; no prompt or assistant text is persisted by this suite.
This exercises host tool-boundary steering.

Set `PI_CLAUDE_BOUNDARY_INSTALLED=1` alongside the inference opt-in to use actual
managed package discovery. This mode requires matching exact installed and
managed release pins, retains the test observers, and restores only the Pi
retry/compaction flags changed by the test.
