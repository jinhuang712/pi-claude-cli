# Roadmap

This fork runs Claude for [pi](https://github.com/earendil-works/pi) through a resident `claude` process. It is pi only, and it follows pi and Claude Code releases.

## Done

| Item                 | Change                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Oh My Pi support     | Removed, with the upstream author's planning and release process files                                                                            |
| Exact pi pin         | Pi 0.99.1 or newer is accepted (`src/compat.ts`)                                                                                                  |
| Exact Claude CLI pin | Claude CLI 2.1.285 or newer is accepted                                                                                                           |
| Pinned dependencies  | The Agent SDK and MCP SDK use caret ranges, and the lockfile is on SDK 0.3.296 and MCP SDK 1.32.1                                                 |
| Issues               | Enabled on this fork                                                                                                                              |
| Smoke test           | `npm run test:smoke` runs a two-prompt task in the installed pi and fails on a model error, a wrong file, or a second Claude process              |
| Extra-usage guard    | Not built. See below.                                                                                                                             |
| Idle session close   | A session's Claude process closes after `PI_CLAUDE_IDLE_CLOSE_MS` idle (default 10 minutes, 0 turns it off). The next prompt replays the history. |

Checked by hand on 2026-10-12 on macOS: pi 1.1.0 and Claude CLI 2.1.296, with the CLI and the SDK driver. A four-call task and a second prompt ran with one resident Claude process for both prompts. The first call of the second prompt took about 1.5 s. Neither driver used extra usage.

**Extra-usage guard.** The `pi-claude-bridge` extension refuses to send a prompt that carries pi's preamble or both of pi's doc paths, because Anthropic's gate may bill such a request as extra usage. This extension sends pi's whole prompt, and that prompt carries both triggers. It did not move the extra-usage credits in any run: Sonnet 5 in the runs above, and one short call each on Opus 4.6, Opus 5.5, and Fable 5.1 on 2026-10-12. This extension replaces Claude Code's system prompt, while the bridge appends to it, which may be why. Without a reproduced problem, the extension doesn't rewrite pi's prompt. `npm run test:smoke` fails when an extra-usage counter you point it at (`PI_SMOKE_CREDITS_URL`) grows, so a change on Anthropic's side shows up there.

**Idle close.** The CLI driver starts Claude with `--no-session-persistence`, so a closed session can't resume by its Claude session ID. The next prompt rebuilds Claude's side from pi's history as text, the same path pi takes after `/compact`. Checked live: with a 4 s idle close and a 10 s pause, the `claude` process was gone after the pause, and the second prompt, in a new process, answered from the replayed history. Resume by session ID is possible only with the SDK driver or by dropping `--no-session-persistence`, and the second choice writes session files into `~/.claude`.

## To do

1. **Driver default.** The CLI driver is the default and the SDK driver is the fallback. Keep it that way, and name the fallback in the README.

## To measure, with no change planned

- After `/compact` or an abort, the extension replays pi's history as text into a fresh Claude session, and the prompt cache starts over. Measure the cost before changing anything.
- The package name is still `@ramarivera/pi-claude-cli`. Rename it before this fork is published anywhere.
