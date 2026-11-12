import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { setupServer } from "msw/node";

import { MOCK_RESET_TOKEN, handlers } from "@/mocks/handlers";
import { MOCK_SCENARIO_HEADER, domainFromUrl, parseScenarioParam, scenarioFor, type MockScenario } from "@/mocks/scenarios";

const BASE = "http://localhost/api";
const server = setupServer(...handlers);
const json = { "Content-Type": "application/json" };
const auth = { ...json, Authorization: "Bearer mock-token-user-1" };

before(() => server.listen({ onUnhandledRequest: "error" }));
after(() => server.close());

type Call = { method: "GET" | "POST" | "PATCH"; path: string; body?: unknown; authed?: boolean };

function call({ method, path, body, authed = true }: Call, scenario?: MockScenario) {
  const headers: Record<string, string> = { ...(authed ? auth : json) };
  if (scenario) headers[MOCK_SCENARIO_HEADER] = scenario;
  return fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const validLogin = { email: "hayverson@patchnotes.dev", password: "patchnotes123" };

const queries: Call[] = [
  { method: "GET", path: "/auth/me" },
  { method: "GET", path: "/dashboard/metrics" },
  { method: "GET", path: "/dashboard/activity-heatmap" },
  { method: "GET", path: "/dashboard/token-usage?period=30d" },
  { method: "GET", path: "/dashboard/entries-by-tag" },
  { method: "GET", path: "/devlog/entries" },
  { method: "GET", path: "/chat/history" },
  { method: "GET", path: "/profile" },
];

const mutations: Call[] = [
  { method: "POST", path: "/auth/login", body: validLogin, authed: false },
  { method: "POST", path: "/auth/register", body: { name: "Nova Pessoa", email: "nova@patchnotes.dev", password: "senha-segura" }, authed: false },
  { method: "POST", path: "/devlog/entries", body: { title: "Título válido", content: "Conteúdo com mais de dez caracteres", tags: ["ui"] } },
  { method: "POST", path: "/chat/send", body: { message: "Como melhorar o combate?" } },
  { method: "PATCH", path: "/profile", body: { bio: "Bio atualizada" } },
  { method: "POST", path: "/auth/forgot-password", body: { email: "hayverson@patchnotes.dev" }, authed: false },
  { method: "POST", path: "/auth/reset-password", body: { token: "token-qualquer-com-mais-de-20", password: "nova-senha-123" }, authed: false },
];

const protectedCalls = [...queries, ...mutations.filter((item) => item.authed !== false)];

describe("sucesso", () => {
  test("login retorna token e usuário", async () => {
    const response = await call(mutations[0]);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.token, "mock-token-user-1");
    assert.equal(body.user.email, validLogin.email);
    assert.equal(body.user.password, undefined);
  });

  test("cadastro retorna 201 e email duplicado retorna 409", async () => {
    const created = await call(mutations[1]);
    assert.equal(created.status, 201);
    const duplicated = await call(mutations[1]);
    assert.equal(duplicated.status, 409);
    assert.equal(typeof (await duplicated.json()).message, "string");
  });

  test("leituras protegidas respondem 200 com o formato do contrato", async () => {
    const shapes: Record<string, string[]> = {
      "/auth/me": ["user"],
      "/dashboard/metrics": ["totalEntries", "tokensUsed", "activeTime", "messagesExchanged", "streak"],
      "/dashboard/activity-heatmap": ["days"],
      "/dashboard/token-usage?period=30d": ["points"],
      "/dashboard/entries-by-tag": ["tags"],
      "/devlog/entries": ["entries"],
      "/chat/history": ["messages"],
      "/profile": ["user"],
    };
    for (const query of queries) {
      const response = await call(query);
      assert.equal(response.status, 200, query.path);
      assert.deepEqual(Object.keys(await response.json()).sort(), [...shapes[query.path]].sort(), query.path);
    }
  });

  test("token-usage respeita o período", async () => {
    const week = await (await call({ method: "GET", path: "/dashboard/token-usage?period=7d" })).json();
    const month = await (await call({ method: "GET", path: "/dashboard/token-usage?period=30d" })).json();
    assert.equal(week.points.length, 7);
    assert.equal(month.points.length, 30);
  });

  test("criar devlog retorna 201 e a entrada aparece na listagem", async () => {
    const response = await call(mutations[2]);
    assert.equal(response.status, 201);
    const { entry } = await response.json();
    const list = await (await call(queries[5])).json();
    assert.equal(list.entries[0].id, entry.id);
  });

  test("chat responde como assistente e grava o histórico", async () => {
    const response = await call(mutations[3]);
    assert.equal(response.status, 200);
    const message = await response.json();
    assert.equal(message.role, "assistant");
    assert.equal(typeof message.tokensUsed, "number");
    const history = await (await call(queries[6])).json();
    assert.equal(history.messages.at(-1).id, message.id);
  });

  test("perfil é atualizado parcialmente", async () => {
    const response = await call(mutations[4]);
    assert.equal(response.status, 200);
    const { user } = await response.json();
    assert.equal(user.bio, "Bio atualizada");
    assert.equal(user.name, "Hayverson");
  });
});

describe("payload inválido (400)", () => {
  const invalidBodies: Call[] = [
    { method: "POST", path: "/auth/login", body: { email: "não-é-email", password: "curta" }, authed: false },
    { method: "POST", path: "/auth/register", body: { name: "A", email: "x", password: "1" }, authed: false },
    { method: "POST", path: "/devlog/entries", body: { title: "ab", content: "curto" } },
    { method: "POST", path: "/chat/send", body: { message: "" } },
    { method: "POST", path: "/chat/send", body: { message: "a".repeat(2001) } },
    { method: "PATCH", path: "/profile", body: { avatarUrl: "não-é-url" } },
  ];

  for (const item of invalidBodies) {
    test(`${item.method} ${item.path} rejeita corpo inválido com details`, async () => {
      const response = await call(item);
      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(typeof body.message, "string");
      assert.ok(Object.keys(body.details.fieldErrors).length > 0);
    });
  }

  test("JSON malformado vira 400, não 500", async () => {
    const response = await fetch(`${BASE}/auth/login`, { method: "POST", headers: json, body: "{" });
    assert.equal(response.status, 400);
  });

  for (const item of mutations) {
    test(`cenário invalid-payload força 400 em ${item.method} ${item.path}`, async () => {
      const response = await call(item, "invalid-payload");
      assert.equal(response.status, 400);
      assert.equal(typeof (await response.json()).message, "string");
    });
  }

  test("cenário invalid-payload não afeta leituras", async () => {
    assert.equal((await call(queries[1], "invalid-payload")).status, 200);
  });
});

describe("não autenticado (401)", () => {
  for (const item of protectedCalls) {
    test(`${item.method} ${item.path} sem token retorna 401`, async () => {
      const response = await call({ ...item, authed: false });
      assert.equal(response.status, 401);
      assert.equal(typeof (await response.json()).message, "string");
    });
  }

  test("login com senha errada retorna 401", async () => {
    const response = await call({ ...mutations[0], body: { ...validLogin, password: "senha-incorreta" } });
    assert.equal(response.status, 401);
  });

  test("cenário unauthorized força 401 mesmo com token válido", async () => {
    const all = [...queries, ...mutations];
    const responses = await Promise.all(all.map((item) => call(item, "unauthorized")));
    responses.forEach((response, index) => assert.equal(response.status, 401, all[index].path));
  });
});

describe("erro de servidor (500)", () => {
  test("cenário server-error força 500 em todos os endpoints", async () => {
    const all = [...queries, ...mutations];
    const responses = await Promise.all(all.map((item) => call(item, "server-error")));
    const bodies = await Promise.all(responses.map((response) => response.json()));
    responses.forEach((response, index) => {
      assert.equal(response.status, 500, all[index].path);
      assert.equal(typeof bodies[index].message, "string", all[index].path);
    });
  });
});

describe("resposta vazia", () => {
  test("listas voltam vazias e métricas zeradas", async () => {
    const read = async (path: string) => (await call({ method: "GET", path }, "empty")).json();
    assert.deepEqual(await read("/dashboard/metrics"), { totalEntries: 0, tokensUsed: 0, activeTime: "0min", messagesExchanged: 0, streak: 0 });
    assert.deepEqual(await read("/dashboard/activity-heatmap"), { days: [] });
    assert.deepEqual(await read("/dashboard/token-usage?period=7d"), { points: [] });
    assert.deepEqual(await read("/dashboard/entries-by-tag"), { tags: [] });
    assert.deepEqual(await read("/devlog/entries"), { entries: [] });
    assert.deepEqual(await read("/chat/history"), { messages: [] });
  });

  test("perfil vazio traz só os campos obrigatórios", async () => {
    const { user } = await (await call({ method: "GET", path: "/profile" }, "empty")).json();
    assert.deepEqual(Object.keys(user).sort(), ["email", "id", "name"]);
  });
});

describe("seleção de cenário no cliente", () => {
  test("parseScenarioParam aceita global, por domínio e ignora inválidos", () => {
    assert.deepEqual(parseScenarioParam("server-error"), { all: "server-error" });
    assert.deepEqual(parseScenarioParam("dashboard:empty,chat:server-error,foo:empty,devlog:xyz"), { dashboard: "empty", chat: "server-error" });
    assert.deepEqual(parseScenarioParam(null), {});
  });

  test("domínio é extraído de URL relativa (Axios) e absoluta", () => {
    assert.equal(domainFromUrl("/dashboard/metrics"), "dashboard");
    assert.equal(domainFromUrl("http://localhost/api/chat/send"), "chat");
    assert.equal(domainFromUrl("/desconhecido"), undefined);
  });

  test("cenário do domínio tem prioridade sobre o global", () => {
    const map = parseScenarioParam("empty,chat:server-error");
    assert.equal(scenarioFor(map, "/chat/history"), "server-error");
    assert.equal(scenarioFor(map, "/devlog/entries"), "empty");
    assert.equal(scenarioFor({}, "/devlog/entries"), "success");
  });
});

describe("refresh, logout e recuperação de senha", () => {
  test("refresh não existe no mock: sempre 401 (a sessão expira como antes)", async () => {
    const response = await call({ method: "POST", path: "/auth/refresh", authed: false });
    assert.equal(response.status, 401);
    assert.equal(typeof (await response.json()).message, "string");
  });

  test("logout responde 204", async () => {
    assert.equal((await call({ method: "POST", path: "/auth/logout", authed: false })).status, 204);
  });

  test("forgot-password responde igual para conta existente e inexistente", async () => {
    const known = await call({ method: "POST", path: "/auth/forgot-password", body: { email: "hayverson@patchnotes.dev" }, authed: false });
    const unknown = await call({ method: "POST", path: "/auth/forgot-password", body: { email: "ninguem@patchnotes.dev" }, authed: false });
    assert.equal(known.status, 202);
    assert.equal(unknown.status, 202);
    assert.deepEqual(await known.json(), await unknown.json());
    assert.equal((await call({ method: "POST", path: "/auth/forgot-password", body: { email: "invalido" }, authed: false })).status, 400);
  });

  test("reset-password: token inválido 400, válido 204 e a nova senha passa a valer", async () => {
    const invalid = await call({ method: "POST", path: "/auth/reset-password", body: { token: "token-errado-com-mais-de-vinte", password: "nova-senha-123" }, authed: false });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).message, /inválido ou expirado/);
    const ok = await call({ method: "POST", path: "/auth/reset-password", body: { token: MOCK_RESET_TOKEN, password: "nova-senha-123" }, authed: false });
    assert.equal(ok.status, 204);
    const login = await call({ method: "POST", path: "/auth/login", body: { email: validLogin.email, password: "nova-senha-123" }, authed: false });
    assert.equal(login.status, 200);
    // devolve a senha original para não afetar outros testes
    await call({ method: "POST", path: "/auth/reset-password", body: { token: MOCK_RESET_TOKEN, password: validLogin.password }, authed: false });
  });
});
