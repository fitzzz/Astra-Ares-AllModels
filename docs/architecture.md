# Architecture

`astra-ares` launches a pinned native Codex with inherited terminal I/O. `Jev-Auto` is a logical catalog selection; existing `Astra-Jev` sessions are accepted as an alias. Native model metadata resolves the selection to a real GPT-6 model on OpenAI requests. Ordinary catalog selections bypass the evaluator. This is a native patch plus a local bridge, not an MCP tool or HTTP proxy.

Before sampling, after tool results and accepted user input enter history, core checks the logical selection. The checkpoint sends its public text projection and available model capabilities over a private Unix socket. The bridge limits evaluator-only tool previews and asks Jev two typed Choice questions: a valid model/effort pair and lease length. Ultra is excluded from every automatic candidate set.

Core applies the result through the live settings owner, retaining the logical Jev selection while changing the real model and effort together. It then captures a fresh `StepContext`, checks its actual model and effort, and acknowledges them. Only then is the decision logged as applied and the native TUI notified. Sampling, permissions, tool execution, OpenAI authentication, and cancellation remain native.

When models differ on the native node REPL review requirement, an automatic route keeps the stricter requirement already admitted for the turn. A route cannot remove an active review requirement.

A lease counts generations, including the immediately upcoming one; it does not count individual parallel tool calls. Each retained pair is acknowledged at a local checkpoint, but the bridge performs no provider evaluation or context tokenization while its lease remains valid. Accepted input revision, failure count, model capabilities, and manual settings changes invalidate stale leases.

For same-model reasoning changes, native `configuration_update` items carry the new effort while the original request effort baseline stays pinned. A cross-model route rebuilds the request context for its target. See OpenAI's [mid-conversation reasoning documentation](https://developers.openai.com/api/docs/guides/reasoning#change-reasoning-mid-conversation). Automatic compaction/truncation and the standalone compact endpoint have restrictions with these history items; long-session behavior needs separate verification.

## Boundaries

- One bridge connection/state machine per active turn; per-connection ownership prevents duplicate simultaneous owners.
- Fixed 2 MB framed transport limit; reply identity and model/effort pair must match the active step and catalog.
- 1000 local tokens for all results of each retained tool call. When historical context grows, the bridge removes oldest public notes, then oldest prior user requests, records omission counts, and retains the current and original turn prompts.
- The bridge reduces historical context toward 26,000 local tokens; the 28,000-token guard still rejects an oversized current task explicitly.
- Same-provider HTTP retries only; no alternative provider/model or saved-effort fallback after failure.
- A provider error does not confirm or apply an effort. A cancelled request cannot commit a decision.
- Source/archive/patch/companion checksums are pinned in `patches/upstream.json`; arbitrary Codex upgrades are not supported.

## Why a native patch

A shell wrapper or MCP server alone cannot reliably interpose between every native sampling step and its captured settings. An Astra HTTP proxy would add a separate transport/cache boundary. The patch exposes the sampling checkpoint and uses the existing settings owner; the public frontend stays the normal Codex CLI.
