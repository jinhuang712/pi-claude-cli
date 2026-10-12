# Claude session and prompt-cache audit

Audit date: October 1, 2026. Tracked by `pcc-k4z`; tool inventory repair by `pcc-6vb`. An independent Sol 6.1/high reviewer inspected both drivers, shared history reconciliation, and cache accounting. Source fixes and offline proofs aren't evidence that the user's installed workload is fixed.

## BB and T3Code comparison

References were refreshed and pinned before inspection:

| Reference                                                                                                                                                   | Continuity pattern                                                                                                  | Difference from this extension                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [BB SDK session](https://github.com/get-bb/bb/blob/1d7e1dc3a1a9e105b928bb0c1744a0d0755c95ea/plugins/provider-claude-code/src/bridge/sdk-session.ts)         | Retains one query and input iterable, queues later prompts, persists sessions and supplies native resume            | Our SDK path also retains one query and input queue; verified restoration after process restart isn't implemented |
| [T3Code Claude adapter](https://github.com/pingdotgg/t3code/blob/0cf482b08bca0249ec94fbcbd0eb04fff28d9b3d/apps/server/src/provider/Layers/ClaudeAdapter.ts) | Retains query plus prompt queue, sets a stable prompt at construction, persists a resume cursor with assistant UUID | Our resident path follows that structure, but reconciles a separate Pi-owned transcript before reuse              |

Neither reference's architecture proves its actual cache hit rate. Both preserve separate uncached/read/write usage. Our CLI keeps the same `claude -p` stream-json process across matching rounds, and our SDK keeps the same query. The CLI's `--no-session-persistence` disables durable transcript storage, not resident context. On matching rounds only current input is sent. Tool/system/configuration changes and host compaction intentionally invalidate resident state; ordinary rounds don't do so. After close or restart the current core uses labelled user-history replay, not verified native resume.

The native tool-name appendix is stable for an unchanged exposed inventory and contains no timestamps or per-round IDs. Native host instructions remain its exact prefix. Object key order and pure tool inventory order don't invalidate the core fingerprint; meaningful string, schema, authentication and settings changes do.

## Verification and remaining gate

Offline probes verify accounting with nonzero native usage, resident plan selection, native hook argument revisions and opaque-thinking round trips. They don't measure Anthropic's server cache.

The opt-in `tests/e2e/cache.test.mjs` covers Pi × CLI/SDK using actual native default prompts: a large synthetic reference, a warm no-tool follow-up, one native bash call whose arguments a native hook rewrites, and another warm follow-up. It requires one successful correlated execution/rewrite, remembered synthetic output, stable Claude identity, a nonshrinking warm cached prefix of at least 4096 tokens, and cache writes below one quarter of cache reads on the two no-tool warm turns. Tool-round usage is a host aggregate; this bounded check doesn't claim to reproduce the user's long conversation or expose raw per-step server usage.

Release 0.4.4 was subsequently published with Ramiro's explicit approval. After the session-limit reset and correction of the cache fixture's exact command, final-source and installed Pi CLI checks passed: one real native hook rewrite, a resident Claude identity, warm prefix reuse and small writes. Source default-prompt read/edit/write checks also passed for that combination.

Pi SDK's isolated native-default-prompt cache/discovery checks still receive the extra-usage 400 before tool execution. A controlled custom/native prompt pair reproduces successful official SDK login inference versus rejection without changing credentials or the executable; see [Pi SDK auth investigation](pi-sdk-auth.md). The complete Pi SDK matrix remains incomplete.

Anthropic's [prompt caching guide](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) documents identical cached prefixes, minimum lengths and cache lifetimes; its [SDK sessions guide](https://code.claude.com/docs/en/agent-sdk/sessions) describes persistence/resume. Session continuity and server-side prompt caching are distinct mechanisms. No unconditional cache guarantee or subscription billing claim follows from this audit.
