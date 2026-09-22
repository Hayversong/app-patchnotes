import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupServer } from "msw/node";

import { handlers } from "@/mocks/handlers";

const server = setupServer(...handlers);
const authHeaders = { Authorization: "Bearer mock-token-user-1", "Content-Type": "application/json" };

before(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
after(() => server.close());

test("login retorna sucesso para credenciais válidas", async () => {
  const response = await fetch("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "hayverson@patchnotes.dev", password: "patchnotes123" }),
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).token, "mock-token-user-1");
});

test("login retorna 401 para credenciais inválidas", async () => {
  const response = await fetch("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "hayverson@patchnotes.dev", password: "senha-incorreta" }),
  });

  assert.equal(response.status, 401);
});

test("login rejeita payload inválido", async () => {
  const response = await fetch("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "não-é-email", password: "curta" }),
  });

  assert.equal(response.status, 400);
});

test("chat retorna resposta para payload válido autenticado", async () => {
  const response = await fetch("http://localhost/api/chat/send", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ message: "Como melhorar o combate?" }),
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).role, "assistant");
});

test("chat retorna 401 sem autenticação", async () => {
  const response = await fetch("http://localhost/api/chat/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Teste" }),
  });

  assert.equal(response.status, 401);
});

test("chat rejeita payload inválido", async () => {
  const response = await fetch("http://localhost/api/chat/send", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ message: "" }),
  });

  assert.equal(response.status, 400);
});
