import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  createWriteStream,
  rmSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { Bridge } from "../../src/bridge.mjs";
import { CodexRpc } from "./rpc.mjs";
const binary = resolve(process.argv[2]),
  evidence = resolve(process.argv[3]);
mkdirSync(evidence, { recursive: true });
const socketDir = mkdtempSync(join(tmpdir(), "cj-select-"));
const home = join(evidence, "home");
mkdirSync(home, { recursive: true });
const catalog = JSON.parse(
  readFileSync(new URL("../fixtures/models.json", import.meta.url), "utf8"),
);
const astra = structuredClone(
  catalog.models.find((m) => m.slug === "gpt-6-astra"),
);
astra.use_responses_lite = true;
const sol = {
  ...structuredClone(astra),
  slug: "gpt-6-sol",
  display_name: "Fixture Sol",
  priority: 1,
};
const luna = {
  ...structuredClone(astra),
  slug: "gpt-6-luna",
  display_name: "Fixture Luna",
  priority: 2,
};
astra.node_repl_auto_review_required = true;
sol.node_repl_auto_review_required = true;
luna.node_repl_auto_review_required = false;
for (const model of [astra, sol, luna])
  model.supported_reasoning_levels.push({
    effort: "xhigh",
    description: "xhigh",
  });
astra.supported_reasoning_levels.push(
  { effort: "max", description: "max" },
  { effort: "ultra", description: "ultra" },
);
sol.supported_reasoning_levels.push(
  { effort: "max", description: "max" },
  { effort: "ultra", description: "ultra" },
);
luna.supported_reasoning_levels.push({ effort: "max", description: "max" });
writeFileSync(
  join(evidence, "models.json"),
  JSON.stringify({ models: [astra, sol, luna] }),
);
const states = [],
  records = [],
  requests = [],
  notifications = [],
  failures = [];
let phase = "plain",
  turnStep = 0;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    if (request.method !== "POST") return new Response(null, { status: 426 });
    try {
      let bytes = Buffer.from(await request.arrayBuffer());
      if (request.headers.get("content-encoding") === "zstd")
        bytes = Bun.zstdDecompressSync(bytes);
      const body = JSON.parse(bytes);
      assert.equal(
        body.model,
        phase === "all-models"
          ? ["gpt-6-luna", "gpt-6-sol", "gpt-6-astra"][turnStep]
          : phase === "manual-ultra" || phase === "manual-max"
            ? "gpt-6-sol"
            : phase === "unsafe-catalog"
              ? "gpt-6-luna"
              : "gpt-6-astra",
        "native route must reach the provider",
      );
      requests.push({ phase, body });
      turnStep++;
      const item =
        (phase === "live-switch" || phase === "all-models") && turnStep <= 2
          ? {
              type: "function_call",
              call_id: `switch-${turnStep}`,
              name: "switch_fixture",
              arguments: JSON.stringify({ step: turnStep }),
            }
          : {
              type: "message",
              id: `final-${requests.length}`,
              role: "assistant",
              content: [{ type: "output_text", text: "READY" }],
            };
      const sse = [
        { type: "response.created", response: { id: `r-${requests.length}` } },
        { type: "response.output_item.done", item },
        {
          type: "response.completed",
          response: {
            id: `r-${requests.length}`,
            usage: {
              input_tokens: 100,
              output_tokens: 10,
              total_tokens: 110,
              input_tokens_details: { cached_tokens: 0 },
              output_tokens_details: { reasoning_tokens: 0 },
            },
          },
        },
      ];
      return new Response(
        sse.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""),
        { headers: { "content-type": "text/event-stream" } },
      );
    } catch (error) {
      failures.push(error.message);
      return new Response("Fixture failed", { status: 500 });
    }
  },
});
const bridge = new Bridge({
  socketPath: join(socketDir, "step.sock"),
  record: (r) => records.push(r),
  jev: {
    decide: async (state) => {
      states.push({ phase, state });
      if (["invalid-ultra", "invalid-max", "invalid-model"].includes(phase))
        return {
          targetModel:
            phase === "invalid-model" ? "another-model" : "gpt-6-astra",
          effort:
            phase === "invalid-ultra"
              ? "ultra"
              : phase === "invalid-max"
                ? "max"
                : "low",
          leaseSteps: 1,
          jevMs: 0,
        };
      if (phase === "unsafe-catalog")
        return {
          targetModel: "gpt-6-luna",
          effort: "low",
          leaseSteps: 1,
          jevMs: 0,
        };
      if (phase === "all-models") {
        const routes = [
          { targetModel: "gpt-6-luna", effort: "low" },
          { targetModel: "gpt-6-sol", effort: "high" },
          { targetModel: "gpt-6-astra", effort: "xhigh" },
        ];
        return {
          ...routes[state.step - 1],
          leaseSteps: 1,
          jevMs: 0,
          cost: "0",
        };
      }
      return {
        targetModel: state.model,
        effort: "low",
        leaseSteps: 10,
        jevMs: 0,
        cost: "0",
      };
    },
  },
});
const settings = {
  model: '"gpt-6-astra"',
  model_provider: '"fixture"',
  "model_providers.fixture": `{name="OpenAI",base_url="http://127.0.0.1:${server.port}/v1",wire_api="responses",requires_openai_auth=false,supports_websockets=false,request_max_retries=0,stream_max_retries=0}`,
  model_catalog_json: JSON.stringify(join(evidence, "models.json")),
  model_reasoning_effort: '"medium"',
  "features.step_model_switching": "true",
  "features.reasoning_effort_override": "true",
  "features.hooks": "false",
  "features.apps": "false",
  "features.plugins": "false",
  "features.code_mode_host": "false",
  "features.remote_models": "false",
  "features.shell_snapshot": "false",
  "analytics.enabled": "false",
  "feedback.enabled": "false",
};
const args = Object.entries(settings).flatMap(([k, v]) => ["-c", `${k}=${v}`]);
args.push("app-server", "--stdio");
const stderr = createWriteStream(join(evidence, "stderr.log"));
let rpc, finish, rejectTurn;
async function connect(withBridge = true) {
  const env = {
    ...process.env,
    CODEX_HOME: home,
    OPENAI_API_KEY: "fixture-only",
    CODEX_API_KEY: "fixture-only",
  };
  delete env.CODEX_STEP_CONTROLLER_SOCKET;
  if (withBridge) env.CODEX_STEP_CONTROLLER_SOCKET = bridge.socketPath;
  rpc = new CodexRpc(binary, args, env, stderr);
  rpc.on("fault", (error) => rejectTurn?.(error));
  rpc.on("message", (m) => {
    if (m.method === "turn/completed") finish(m.params.turn);
    else if (m.method === "turn/reasoningEffort/updated")
      notifications.push(m.params);
    else if (m.method === "item/tool/call") {
      if (phase === "all-models") {
        rpc.send({
          id: m.id,
          result: {
            success: true,
            contentItems: [{ type: "inputText", text: "Next step." }],
          },
        });
        return;
      }
      rpc
        .call("turn/settings/update", {
          threadId: m.params.threadId,
          turnId: m.params.turnId,
          model: m.params.arguments.step === 1 ? "gpt-6-astra" : "Astra-Jev",
          effort: "medium",
        })
        .then((result) => {
          assert.equal(result.status, "applied");
          rpc.send({
            id: m.id,
            result: {
              success: true,
              contentItems: [{ type: "inputText", text: "Settings applied." }],
            },
          });
        })
        .catch(rejectTurn);
    } else if (m.id !== undefined)
      rejectTurn?.(new Error(`Unexpected server request ${m.method}`));
  });
  await rpc.call("initialize", {
    clientInfo: { name: "jev-selection-fixture", version: "4" },
    capabilities: { experimentalApi: true },
  });
  rpc.send({ method: "initialized", params: {} });
}
async function run(id, newPhase) {
  phase = newPhase;
  turnStep = 0;
  let timer;
  const completion = new Promise((resolve, reject) => {
    finish = resolve;
    rejectTurn = reject;
    timer = setTimeout(
      () => reject(new Error(`Turn timed out: ${phase}`)),
      30_000,
    );
  }).finally(() => clearTimeout(timer));
  completion.catch(() => {});
  await rpc.call("turn/start", {
    threadId: id,
    input: [{ type: "text", text: `Selection fixture: ${phase}` }],
  });
  return await completion;
}
try {
  await bridge.start();
  await connect();
  const models = await rpc.call("model/list", { includeHidden: false });
  assert(models.data.some((m) => m.model === "Jev-Auto"));
  assert(models.data.some((m) => m.model === "gpt-6-astra"));
  const created = await rpc.call("thread/start", {
    model: "gpt-6-astra",
    cwd: evidence,
    approvalPolicy: "never",
    sandbox: "read-only",
    dynamicTools: [
      {
        type: "function",
        name: "switch_fixture",
        description: "Change mode between sampling steps",
        inputSchema: {
          type: "object",
          properties: { step: { type: "integer" } },
          required: ["step"],
          additionalProperties: false,
        },
      },
    ],
  });
  const id = created.thread.id;
  assert.equal((await run(id, "plain")).status, "completed");
  assert.equal(states.length, 0);
  let updated = await rpc.call("thread/settings/update", {
    threadId: id,
    model: "Astra-Jev",
  });
  assert.deepEqual(updated, {});
  assert.equal((await run(id, "adaptive")).status, "completed");
  assert.equal(states.length, 1);
  await rpc.call("thread/settings/update", {
    threadId: id,
    model: "gpt-6-astra",
    effort: "medium",
  });
  assert.equal((await run(id, "plain-again")).status, "completed");
  assert.equal(states.length, 1);
  assert.equal(requests.at(-1).body.reasoning.effort, "medium");
  await rpc.call("thread/settings/update", {
    threadId: id,
    model: "Astra-Jev",
  });
  assert.equal((await run(id, "adaptive-again")).status, "completed");
  assert.equal(states.length, 2);
  rpc.stop();
  await connect();
  const resumed = await rpc.call("thread/resume", { threadId: id });
  assert.equal(resumed.model, "Astra-Jev");
  assert.equal((await run(id, "resumed")).status, "completed");
  assert.equal(states.length, 3);
  assert.equal((await run(id, "live-switch")).status, "completed");
  assert.equal(states.length, 5);
  const live = requests.filter((r) => r.phase === "live-switch");
  const effectiveEffort = (body) =>
    body.input.findLast((item) => item.type === "configuration_update")
      ?.reasoning.effort ?? body.reasoning.effort;
  assert.deepEqual(
    live.map((r) => effectiveEffort(r.body)),
    ["low", "medium", "low"],
  );
  assert(
    live.every((r) => r.body.reasoning.effort === "low"),
    "native cache baseline should remain pinned",
  );
  for (let n = 1; n < live.length; n++)
    assert.deepEqual(
      live[n].body.input.slice(0, live[n - 1].body.input.length),
      live[n - 1].body.input,
    );
  rpc.stop();
  await connect(false);
  const missing = await rpc.call("thread/start", {
    model: "Astra-Jev",
    cwd: evidence,
    approvalPolicy: "never",
    sandbox: "read-only",
  });
  const before = requests.length;
  const failed = await run(missing.thread.id, "missing-bridge");
  assert.equal(failed.status, "failed");
  assert.match(failed.error.message, /Launch astra-ares/);
  assert.equal(requests.length, before);
  await rpc.call("thread/settings/update", {
    threadId: missing.thread.id,
    model: "gpt-6-astra",
    effort: "medium",
  });
  assert.equal(
    (await run(missing.thread.id, "plain-without-bridge")).status,
    "completed",
  );
  assert.equal(states.length, 5);
  rpc.stop();
  await connect();
  const routed = await rpc.call("thread/start", {
    model: "Jev-Auto",
    cwd: evidence,
    approvalPolicy: "never",
    sandbox: "read-only",
    dynamicTools: [
      {
        type: "function",
        name: "switch_fixture",
        description: "Continue the fixture",
        inputSchema: {
          type: "object",
          properties: { step: { type: "integer" } },
          required: ["step"],
          additionalProperties: false,
        },
      },
    ],
  });
  assert.equal((await run(routed.thread.id, "all-models")).status, "completed");
  const routedRequests = requests.filter((r) => r.phase === "all-models");
  assert.deepEqual(
    routedRequests.map((r) => r.body.model),
    ["gpt-6-luna", "gpt-6-sol", "gpt-6-astra"],
  );
  assert.deepEqual(
    routedRequests.map((r) => effectiveEffort(r.body)),
    ["low", "high", "xhigh"],
  );
  assert.deepEqual(
    notifications
      .filter((n) => n.threadId === routed.thread.id)
      .map((n) => n.fromModel),
    [null, "gpt-6-luna", "gpt-6-sol"],
  );
  assert.equal(
    records.find(
      (r) =>
        r.threadId === routed.thread.id &&
        r.type === "model_selected" &&
        r.step === 1,
    ).from,
    null,
  );
  assert(
    routedRequests[1].body.input.some((item) =>
      JSON.stringify(item).includes("switch-1"),
    ),
  );
  assert(
    routedRequests[2].body.input.some((item) =>
      JSON.stringify(item).includes("switch-2"),
    ),
  );
  rpc.stop();
  await connect();
  const resumedAuto = await rpc.call("thread/resume", {
    threadId: routed.thread.id,
  });
  assert.equal(resumedAuto.model, "Jev-Auto");
  const noticesBeforeResume = notifications.length;
  assert.equal((await run(routed.thread.id, "all-models")).status, "completed");
  assert.equal(notifications[noticesBeforeResume].fromModel, null);
  const beforeInvalid = requests.length;
  for (const invalid of ["invalid-ultra", "invalid-max", "invalid-model"]) {
    const failedRoute = await run(routed.thread.id, invalid);
    assert.equal(failedRoute.status, "failed");
    assert.match(failedRoute.error.message, /unsupported/);
    assert.equal(requests.length, beforeInvalid);
  }
  const manual = await rpc.call("thread/start", {
    model: "gpt-6-sol",
    cwd: evidence,
    approvalPolicy: "never",
    sandbox: "read-only",
  });
  await rpc.call("thread/settings/update", {
    threadId: manual.thread.id,
    model: "gpt-6-sol",
    effort: "ultra",
  });
  const beforeManual = states.length;
  assert.equal(
    (await run(manual.thread.id, "manual-ultra")).status,
    "completed",
  );
  assert.equal(states.length, beforeManual, "manual Ultra must bypass Jev");
  assert.equal(requests.at(-1).body.model, "gpt-6-sol");
  await rpc.call("thread/settings/update", {
    threadId: manual.thread.id,
    model: "gpt-6-sol",
    effort: "max",
  });
  assert.equal((await run(manual.thread.id, "manual-max")).status, "completed");
  assert.equal(states.length, beforeManual, "manual Max must bypass Jev");
  rpc.stop();
  writeFileSync(
    join(evidence, "models.json"),
    JSON.stringify({
      models: [{ ...astra, node_repl_disabled: true }, sol, luna],
    }),
  );
  await connect();
  const unsafe = await rpc.call("thread/start", {
    model: "Jev-Auto",
    cwd: evidence,
    approvalPolicy: "never",
    sandbox: "read-only",
  });
  assert.equal(
    (await run(unsafe.thread.id, "unsafe-catalog")).status,
    "completed",
  );
  assert(
    !states.at(-1).state.models.some((model) => model.slug === "gpt-6-astra"),
  );
  assert.deepEqual(failures, []);
  const result = {
    passed: true,
    scope:
      "Actual native CLI/app-server with explicit local provider and Jev fixtures",
    modelPicker: ["gpt-6-astra", "gpt-6-sol", "gpt-6-luna", "Jev-Auto"],
    routedModels: ["gpt-6-luna", "gpt-6-sol", "gpt-6-astra"],
    routedHistoryPreserved: true,
    autoSelectionPersistsAcrossRestart: true,
    manualUltraBypassesJev: true,
    manualMaxBypassesJev: true,
    invalidAutomaticRoutesFailBeforeInference: true,
    unsafeRouteExcludedBeforeJev: true,
    aliasNeverSentToProvider: true,
    plainModelZeroJevCalls: true,
    selectionPersistsAcrossRestart: true,
    nativeConfigurationUpdates: true,
    pinnedRequestEffort: "low",
    liveSwitchEfforts: ["low", "medium", "low"],
    preservedPrefix: true,
    missingBridgeFailsBeforeInference: true,
    plainWorksWithoutBridge: true,
    inferenceRequests: requests.length,
    evaluatorCalls: states.length,
    records,
  };
  writeFileSync(join(evidence, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, records: undefined }, null, 2));
} finally {
  rpc?.stop();
  await bridge.stop();
  server.stop(true);
  stderr.end();
  rmSync(socketDir, { recursive: true, force: true });
}
