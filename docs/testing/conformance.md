# Offline production conformance

Run `npx vitest run tests/conformance --reporter=dot`. The suite includes the version 1.1.0 synthetic envelopes, recorded initialization controls, 46 shared production driver/core checks across CLI/SDK.

`tests/support/production-drivers.ts` constructs the production CLI and SDK drivers with `createClaudeEventNormalizer`. CLI runs an isolated authored child process over real JSONL and the driver's real stdio MCP endpoint. SDK uses its public `loadSdk/query` seam to supply authored inference traffic and connects an official MCP client to the production SDK MCP server. Both inference substitutes execute the same scenario definition. They make no authenticated Claude request.

The shared assertions cover delta/snapshot deduplication, authoritative resident identity, monotonic events and exactly one terminal, intact system prompt/native schemas/arguments, parallel calls/results in reverse order, early results, identical/conflicting duplicates, `isError` cancellation, no kill at a tool boundary, selected-driver failure, independent runtime ownership, saved-host-history replay, and complete historical roles/images/thinking/signatures/calls/structured results. Abort cases run during active inference and during an unfinished message with parked handlers. Cleanup verifies closed queries, dead owned CLI processes and deleted private CLI resources.

Raw MCP listing/results are checked at the transport boundary because normalized observations deliberately bound deep diagnostic data. Host-only details aren't forwarded as model-directed MCP results.

The deterministic replacement suites' authored inference traffic doesn't establish authenticated runtime behavior. See [the live harness](./live-harness.md) for current receipts and gates.

The versioned synthetic catalog and recorded public initialize response satisfy the current fixture scope. Optional future raw assistant/tool recordings would extend protocol examples; they aren't a missing deterministic-suite or fixture acceptance gate, and they won't replace actual host assertions.

The accepted serialized-dispatch correction preserves the frozen contract: only a completed authoritative assistant proposal batch with at least one real MCP park matching the completed ID, name and arguments may open a host tool round. Core buffers results for other completed proposals until their actual handlers park and ID/name/arguments validate. Released late calls don't reappear as native tool proposals. SDK handlers never return an early fabricated success, and proposals never become fabricated `host_tool_request` events. Bounded dispatch/result timers and cancellation still settle outstanding calls; invalid or conflicting metadata, unfinished messages and zero actual parks don't qualify. The deterministic suite includes targeted serialized-dispatch regressions.
