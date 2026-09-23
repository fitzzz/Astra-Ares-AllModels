# Jev provider access

Provider information checked on September 22, 2026. Check the linked provider pages for current pricing and account requirements.

## OpenRouter

1. Sign in to OpenRouter and add funds on [Credits](https://openrouter.ai/settings/credits).
2. Create a regular inference key on [API keys](https://openrouter.ai/workspaces/default/keys).
3. Run `ares configure --provider openrouter`, paste the key into the hidden prompt, then run `ares doctor --probe`.

[Jev 1.13](https://openrouter.ai/typesafe/jev-1.13) is listed at **$0.042 per million input tokens**, with free output tokens. At that input rate, 10,000 billable input tokens cost $0.00042, excluding credit-purchase fees. Check the actual checkout total and [funding FAQ](https://openrouter.ai/docs/faq). Ares never purchases credits.

The adapter uses `POST https://openrouter.ai/api/alpha/decisions`, not a chat endpoint. It pins `typesafe/jev-1.13`, restricts routing to `typesafe`, and disables provider fallbacks. The response must identify that model version and provider `TypeSafe`. See the [published OpenAPI](https://openrouter.ai/openapi.json) and [provider endpoint data](https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints).

## Direct TypeSafe

The official [quick start](https://docs.typesafe.ai/introduction/quickstart) directs users to [console.typesafe.ai](https://console.typesafe.ai/) for a key. The [model reference](https://docs.typesafe.ai/models) lists pricing and rate-limit information. Account access is provider-controlled.

Use `ares configure` with a TypeSafe key. Vercel and OpenRouter keys do not authenticate to the direct TypeSafe endpoint. This adapter has contract-test coverage; run `ares doctor --probe` to verify live access. Sustained capacity still depends on TypeSafe's service.

## Vercel AI Gateway

Use `ares configure --provider vercel` with an AI Gateway key. See Vercel's [pricing and limits guide](https://vercel.com/academy/ai-gateway/ai-gateway-pricing). The evaluator model is `typesafe-ai/jev`.

## Capacity and errors

Paying for credits does not guarantee upstream capacity. A `429` can represent account rate limits or provider saturation, while a billing rejection may require additional credits. Context errors are classified separately; `429` alone is not evidence of a context overflow.

Use request sizes, provider codes, request IDs and retry records in the local logs to diagnose a failure. Provider selection is explicit and never changes automatically. See [troubleshooting](troubleshooting.md).
