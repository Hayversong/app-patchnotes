import { expect, test, type Page } from "@playwright/test";

import { openChat, visit } from "./helpers";

type Metrics = { messagesExchanged: number; tokensUsed: number; activeTime: string };

/** Lê a API com a mesma sessão da página (cookies HttpOnly do contexto). */
async function api<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(path);
  expect(response.ok(), path).toBeTruthy();
  return (await response.json()) as T;
}

/** Métricas da API e conferência de que o card da tela mostra o mesmo valor. */
async function metrics(page: Page): Promise<Metrics> {
  await page.goto("/dashboard");
  const data = await api<Metrics>(page, "/api/dashboard/metrics");
  const card = (label: string) => page.locator("[data-slot=card]").filter({ hasText: label });
  await expect(card("Mensagens trocadas").locator(".sr-only")).toHaveText(data.messagesExchanged.toLocaleString("pt-BR"));
  await expect(card("Tokens consumidos").locator(".sr-only").first()).toHaveText(data.tokensUsed.toLocaleString("pt-BR"));
  await expect(card("Tempo de uso")).toContainText(data.activeTime);
  return data;
}

async function balance(page: Page): Promise<number> {
  return (await api<{ balance: number }>(page, "/api/tokens/balance")).balance;
}


test("dashboard, saldo e extrato refletem o consumo real de uma conversa", async ({ page }) => {
  const before = await metrics(page);
  const balanceBefore = await balance(page);

  await openChat(page);
  await page.locator("#message").fill("Responda só: ok");
  await page.locator("#message").press("Enter");
  await expect(page.locator("#message")).toBeDisabled();
  await expect(page.locator("#message")).toBeEnabled({ timeout: 120_000 });

  const after = await metrics(page);
  expect(after.messagesExchanged).toBe(before.messagesExchanged + 2);
  expect(after.tokensUsed).toBeGreaterThan(before.tokensUsed);
  await expect(page.locator("svg.recharts-surface").first()).toBeVisible();
  expect(await balance(page)).toBe(balanceBefore - (after.tokensUsed - before.tokensUsed));

  await page.goto("/tokens");
  const usage = page.getByRole("list", { name: "Lançamentos de tokens" }).getByRole("listitem").first();
  await expect(usage).toContainText("Resposta do assistente");
  await expect(usage).toContainText(/entrada \+ \d+ saída/);
});

test("recarga simulada soma ao saldo e entra no extrato", async ({ page }) => {
  await visit(page, "/tokens");
  await expect(page.getByText("Saldo atual")).toBeVisible();
  const before = await balance(page);

  await page.getByRole("button", { name: "+10.000" }).click();
  await expect(page.getByText(/Recarga de 10\.000 tokens concluída/)).toBeVisible();
  expect(await balance(page)).toBe(before + 10_000);

  const first = page.getByRole("list", { name: "Lançamentos de tokens" }).getByRole("listitem").first();
  await expect(first).toContainText("Recarga simulada");
  await expect(first).toContainText("+10.000");
});
