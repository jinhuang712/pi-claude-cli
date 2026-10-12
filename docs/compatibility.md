# Supported versions

The extension runs on a range of releases. Each component has a minimum, which the extension enforces at startup, and a tested version, the newest release the maintainer ran the smoke test on. A release newer than the tested one is accepted. It runs unless pi or the Claude CLI changed an interface the extension uses, and the smoke test is how a new release is checked. The constants live in `src/compat.ts`.

| Component                          | Minimum (enforced) | Tested             |
| ---------------------------------- | ------------------ | ------------------ |
| Node.js                            | 22.19.0            | 26.0.0             |
| Canonical Pi (`@earendil-works/*`) | 0.99.1             | 1.1.0              |
| Published Claude Code executable   | 2.1.285            | 2.1.296            |
| Official Claude Agent SDK          | `^0.3.285`         | 0.3.296 (lockfile) |
| MCP SDK                            | `^1.31.0`          | 1.32.1 (lockfile)  |

Pi and the Claude executable below their minimum fail at startup with a message that names the minimum. A version string the extension can't read fails the same way.

The CLI driver checks the executable version before inference. The root entrypoint and provider ID remain `pi-claude-cli`.

The CLI host-tool bridge uses a private Unix-domain socket and process-group cleanup. Windows isn't supported by this driver. The tested versions above were run on macOS (Apple silicon). SDK transport also needs a supported official Claude executable/runtime.

Both drivers require authoritative `_meta["claudecode/toolUseId"]` on host MCP calls. That's a guarded Claude protocol extension, not a generic MCP guarantee. Missing correlation fails explicitly; the bridge never substitutes JSON-RPC IDs or guesses from call order.

Same-process continuation retains the resident Claude identity. Imported or changed host history can be replayed under a fresh Claude identity. This replay labels the complete host history as user-provided context; it doesn't import private Claude JSONL files or claim native assistant-turn persistence. Both production drivers accept queued steering at host tool boundaries, with native queue admission before releasing original results. Immediate during-token preemption isn't integrated.

Provider payload callbacks receive the host-neutral request. Transport response observations use status `0` and transport metadata for these subprocess/query transports; they don't invent an HTTP response. Error/abort results carry each host's actual assistant-message shape.
