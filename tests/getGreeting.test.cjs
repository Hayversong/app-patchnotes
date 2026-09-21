const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Exercise the actual utility without adding a test runner dependency.
const source = readFileSync(resolve(__dirname, "../src/lib/getGreeting.ts"), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const context = { exports: {} };
vm.runInNewContext(outputText, context);
const { getGreeting } = context.exports;
const at = (hour, minute = 0) => new Date(2026, 8, 21, hour, minute);

test("uses a fallback before user data is available", () => {
  for (const name of [undefined, null, "", "   "]) {
    assert.equal(getGreeting(name, at(12), () => 0), "Bem-vindo de volta");
  }
});

test("respects all local-time period boundaries", () => {
  const cases = [
    [0, 0, "Ainda acordado, Ana?"],
    [5, 59, "Ainda acordado, Ana?"],
    [6, 0, "Bom dia, Ana"],
    [11, 59, "Bom dia, Ana"],
    [12, 0, "Boa tarde, Ana"],
    [17, 59, "Boa tarde, Ana"],
    [18, 0, "Boa noite, Ana"],
    [23, 59, "Boa noite, Ana"],
  ];
  for (const [hour, minute, expected] of cases) {
    assert.equal(getGreeting("Ana Silva", at(hour, minute), () => 0), expected);
  }
});

test("provides two or three distinct choices per period", () => {
  for (const hour of [0, 6, 12, 18]) {
    const results = new Set([0, 0.5, 0.99].map((choice) =>
      getGreeting("João", at(hour), () => choice)));
    assert.ok(results.size >= 2 && results.size <= 3);
    for (const result of results) assert.ok(result.includes("João"));
  }
});

test("trims the name and keeps a seeded choice stable across renders", () => {
  const result = getGreeting("  Júlia   Santos ", at(18), () => 0.8);
  assert.equal(result, "Hora de criar, Júlia?");
  assert.equal(getGreeting("Júlia Santos", at(18), () => 0.8), result);
});
