# Troubleshooting

Start with `ares doctor`, then `ares doctor --probe`. The second command makes one small real evaluator request. It does not invoke Astra.

| Error category           | Meaning / next action                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `local_context_limit`    | Nothing was sent. The request still exceeded the 28K guard after old notes and prior requests were removed. Shorten the current task; switching API keys does not change this local limit. |
| `context_limit`          | Provider explicitly returned a context-limit code. Preserve the request size/code in the log. The bridge does not retry an unchanged oversized request.                                    |
| `rate_limit_or_capacity` | HTTP 429. Read `providerCode`, `providerMessage`, request ID, local tokens, and retry events. A small request can fail due to account rate limits or provider capacity.                    |
| `quota`                  | Billing/credit/account budget rejection. Supply a funded or authorized key; no automatic retries or purchases.                                                                             |
| `authentication`         | Check the selected provider and its matching key. A Vercel key cannot authenticate directly to TypeSafe.                                                                                   |
| `provider_unavailable`   | Transient upstream HTTP error; bounded retries are logged.                                                                                                                                 |
| `timeout` / `network`    | The evaluator did not return within the deadline or transport failed. Current turn stops explicitly.                                                                                       |

Transient status codes: 408, 429, 500, 502, 503, 504, 529. Maximum three attempts and a 30-second total deadline. Backoff begins at 500 ms with jitter. A server `Retry-After` that exceeds the deadline is reported without an early retry. No provider switch is made.

Vercel documents per-model rate limits for free accounts in its [pricing tutorial](https://vercel.com/academy/ai-gateway/ai-gateway-pricing). TypeSafe documents dynamically adjusted limits and a [32K state-plus-longest-question budget](https://docs.typesafe.ai/models). These are independent limits. A 429 alone cannot establish which one was hit.

To remove the gateway from the path, explicitly configure `provider: "typesafe"` and a TypeSafe key. This is an operator choice, not an automatic recovery strategy. A better-funded key may resolve account quota, but cannot guarantee recovery from an upstream capacity incident.

For paid access through a different gateway, `ares configure --provider openrouter` selects OpenRouter's native Decisions endpoint with a funded OpenRouter key. It still serves TypeSafe's model; another billing route is not a guarantee of extra upstream capacity. A 402 means insufficient credit; 429 remains a rate/capacity error. See [paid access](paid-access.md).

After upgrading the local bridge, quit and relaunch `astra-ares resume --last`; a running Node process retains its loaded code. Your native Codex thread/history remains on disk.

## Native warning items during resume

The native build requires the Jev bridge for `Jev-Auto` and the legacy `Astra-Jev` alias. Start through `astra-ares`; launching the native executable directly does not start the bridge.

Codex's JSON output represents some native warnings as `item.type: error`. The experimental-feature notice is expected for `step_model_switching` and `reasoning_effort_override`. On resume, the pinned build can compare a saved logical selection such as `Jev-Auto` with its resolved inference model and emit a cosmetic model-change warning. These notices do not establish a failed turn; check `turn.failed`, process exit status, and the bridge's `controller_error`/`provider_error` records. The alias comparison remains a known diagnostic limitation.

## Build trouble

`setup` fails on an archive/patch checksum mismatch, an incomplete build directory, or a stock binary without the native checkpoint. It does not continue with an unpatched CLI. For a failed source extraction, inspect/remove only the indicated build directory and rerun setup. Keep at least 10 GB free. Build artifacts can be removed after installation; keep `<data>/bin`, config, and Codex history.
