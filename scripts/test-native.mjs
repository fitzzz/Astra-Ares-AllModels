import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
const binary = process.env.JEV_TEST_BINARY;
if (!binary) throw new Error("Set JEV_TEST_BINARY to the patched Codex binary");
const outputRoot = resolve(process.env.JEV_TEST_OUTPUT_DIR ?? "work");
for (const name of ["context", "session", "selection"]) {
  const out = join(outputRoot, `test-${name}-${Date.now()}`);
  mkdirSync(out, { recursive: true });
  const child = spawn(
    "bun",
    [`test/native/native-${name}-test.mjs`, binary, out],
    { stdio: "inherit" },
  );
  const code = await new Promise((r, j) => {
    child.once("error", j);
    child.once("exit", r);
  });
  if (code !== 0) process.exit(code ?? 1);
}
