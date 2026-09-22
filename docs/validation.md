# Testing

The test suite verifies routing contracts at two levels. It does not establish model quality or production availability.

## Unit and regression tests

```sh
npm ci
npm test
```

These tests require no API keys. They cover model/effort pair and lease validation, lease reuse and invalidation, Ultra exclusion, bounded tool previews, Unicode and JSON escaping, exact-body HTTP retries, cancellation, explicit provider errors, credential handling, and CLI configuration.

Launcher regressions cover prompt text after `--`, option values that resemble flags or commands, and rejection of actual unsupported transports. RPC regressions verify that a missing executable rejects pending and future calls immediately instead of waiting for the request timeout.

## Native integration fixtures

Build or adopt the compatible native Codex, install Bun, then run:

```sh
JEV_TEST_BINARY="/path/to/new/patched/codex" npm run test:native
```

Set `JEV_TEST_OUTPUT_DIR` to keep test evidence outside the checkout. The three suites run the actual native executable against explicit local Responses and Jev fixtures; they make no vendor requests.

| Suite     | Boundary checked                                                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Context   | Task text and public notes preserved; recent tool previews bounded; main-model history unchanged; opaque reasoning excluded        |
| Session   | Settings acknowledged before inference; leases; accepted user input; cancellation; visible provider failure; ordinary-model bypass |
| Selection | Luna → Sol → Astra routing, retained history, restart/resume, manual Ultra bypass, effort updates, missing bridge rejection        |

Artifacts default to ignored `work/` directories. Set `JEV_TEST_OUTPUT_DIR` for durable local evidence. Same-model request-prefix preservation and cross-model retained history are checked separately. Long-session compaction needs dedicated verification. CI runs unit tests and package checks on Linux and macOS.

## Live checks

```sh
ares doctor          # local installation and configuration checks
ares doctor --probe  # one small, billable Jev request
```

A successful probe verifies that the configured provider accepted one request. It does not prove sustained capacity or model quality. Also run one ordinary request on each GPT-6 model and one `Jev-Auto` request in an isolated profile. Check local decision logs for the actual target model, effort, and native acknowledgement. Keep task transcripts and credentials out of public reports.
