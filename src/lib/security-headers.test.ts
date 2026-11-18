import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy } from "@/lib/security-headers";

function directives(policy: string): Record<string, string[]> {
  return Object.fromEntries(policy.split("; ").map((item) => { const [name, ...values] = item.split(" "); return [name, values]; }));
}

describe("Content-Security-Policy", () => {
  it("produção: nonce, sem eval e WebSocket do chat liberado", () => {
    const csp = directives(buildContentSecurityPolicy("abc", false));
    expect(csp["script-src"]).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'"]);
    expect(csp["connect-src"]).toContain("ws://localhost:8000");
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
  });

  it("desenvolvimento libera eval e ws: para o recarregamento do Next", () => {
    const csp = directives(buildContentSecurityPolicy("abc", true));
    expect(csp["script-src"]).toContain("'unsafe-eval'");
    expect(csp["connect-src"]).toContain("ws:");
    expect(csp["upgrade-insecure-requests"]).toBeUndefined();
  });
});
