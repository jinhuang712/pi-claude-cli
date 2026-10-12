# Roadmap

This fork runs Claude for [pi](https://github.com/earendil-works/pi) through a resident `claude` process. It is pi only, and it follows pi and Claude Code releases.

## Done

| Item                 | Change                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Oh My Pi support     | Removed, with the upstream author's planning and release process files                            |
| Exact pi pin         | Pi 0.99.1 or newer is accepted (`src/compat.ts`)                                                  |
| Exact Claude CLI pin | Claude CLI 2.1.285 or newer is accepted                                                           |
| Pinned dependencies  | The Agent SDK and MCP SDK use caret ranges, and the lockfile is on SDK 0.3.296 and MCP SDK 1.32.1 |
| Issues               | Enabled on this fork                                                                              |

Checked by hand on 2026-10-12 on macOS: pi 1.1.0 and Claude CLI 2.1.296, with the CLI and the SDK driver. A four-call task and a second prompt ran with one resident Claude process for both prompts. The first call of the second prompt took about 1.5 s. Neither driver used extra usage.

## To do

1. **A smoke test per release.** One command that runs the four-call task and a second prompt against the installed pi and Claude CLI, checks the result, and prints each call's time. It replaces the upstream author's live-verification matrix, and it is how a new pi or Claude Code release gets added to the tested versions in `docs/compatibility.md`.
2. **An extra-usage guard.** Anthropic may bill requests that carry pi's default system prompt as extra usage. The `pi-claude-bridge` extension refuses to send such a prompt. This extension sends pi's prompt unchanged. Credits did not move in the runs above, which used Sonnet 5 only. Add the same guard, then test the Opus and Fable models.
3. **Idle session close.** Each live pi session keeps a Claude process of about 150–330 MB, and the extension never closes it while pi runs. Close a session's process after a configurable idle time (for example 10 minutes) and resume it by its session ID on the next prompt.
4. **Driver default.** The CLI driver is the default and the SDK driver is the fallback. Keep it that way, and name the fallback in the README.

## To measure, with no change planned

- After `/compact` or an abort, the extension replays pi's history as text into a fresh Claude session, and the prompt cache starts over. Measure the cost before changing anything.
- The package name is still `@ramarivera/pi-claude-cli`. Rename it before this fork is published anywhere.
