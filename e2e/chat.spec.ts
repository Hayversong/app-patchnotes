import { expect, test, type WebSocketRoute } from "@playwright/test";

import { openChat, parseFrame } from "./helpers";

test("histórico vem por REST ao abrir a tela, nunca pelo WebSocket", async ({ page }) => {
  const frames: string[] = [];
  page.on("websocket", (socket) => socket.on("framereceived", (frame) => frames.push(parseFrame(frame.payload).type ?? "?")));
  const history = page.waitForResponse((response) => response.url().endsWith("/api/chat/history"));
  await openChat(page);
  expect((await history).status()).toBe(200);
  expect(frames).toEqual(["ready"]);
});

test("resposta em streaming token a token, com input bloqueado e indicador de digitando", async ({ page }) => {
  const frames: string[] = [];
  page.on("websocket", (socket) => socket.on("framereceived", (frame) => frames.push(parseFrame(frame.payload).type ?? "?")));
  await openChat(page);

  const message = page.locator("#message");
  const question = `Ideia curta de mecânica de pulo duplo (${Date.now()})`;
  await message.fill(question);
  await message.press("Enter");

  await expect(message).toBeDisabled();
  await expect(page.getByRole("button", { name: /Assistente digitando/ })).toBeVisible();
  await expect(message).toBeEnabled({ timeout: 120_000 });

  const tokens = frames.filter((type) => type === "token").length;
  expect(tokens).toBeGreaterThan(1);
  expect(frames).toContain("done");
  expect(frames.indexOf("done")).toBeGreaterThan(frames.lastIndexOf("token"));

  // Persistido no banco, com a contagem de tokens de cada mensagem.
  const user = page.getByRole("article", { name: "Você" }).filter({ hasText: question });
  await expect(user).toContainText(/\d+ tokens/);
  await page.reload();
  await expect(page.getByRole("article", { name: "Você" }).filter({ hasText: question })).toBeVisible();
  await expect(page.getByRole("article", { name: "Assistente" }).last()).toContainText(/\d+ tokens/);
});

test("Shift+Enter quebra a linha sem enviar", async ({ page }) => {
  await openChat(page);
  const message = page.locator("#message");
  await message.fill("linha 1");
  await message.press("Shift+Enter");
  await message.pressSequentially("linha 2");
  await expect(message).toHaveValue("linha 1\nlinha 2");
  await expect(message).toBeEnabled();
});

test("queda do WebSocket mostra aviso, bloqueia o envio e reconecta sozinho", async ({ page }) => {
  let first: WebSocketRoute | undefined;
  await page.routeWebSocket(/\/ws\/chat$/, (socket) => {
    socket.connectToServer();
    first ??= socket;
  });
  await openChat(page);

  await first?.close({ code: 1011, reason: "queda simulada" });
  const alert = page.getByRole("alert").filter({ hasText: "Conexão com o assistente perdida" });
  await expect(alert).toBeVisible();
  await expect(page.locator("#message")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reconectar agora" })).toBeVisible();

  await expect(alert).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Enviar mensagem" })).toBeEnabled();
});
