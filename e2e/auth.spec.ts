import { expect, test } from "@playwright/test";

import { login, PASSWORD, register, uniqueEmail } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

test("rota protegida sem sessão leva ao login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("senha errada mostra o erro da API e não entra", async ({ page }) => {
  await login(page, "ninguem-aqui@patchnotes.dev", "senha-errada-123");
  await expect(page.getByRole("alert").filter({ hasText: /incorret|inválid/i })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("cadastro, logout que revoga a sessão e login de novo (JWT de ponta a ponta)", async ({ page }) => {
  const email = uniqueEmail("auth");
  await register(page, "Pessoa E2E", email);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pessoa");

  const logout = page.waitForResponse((response) => response.url().endsWith("/api/auth/logout"));
  await page.getByRole("button", { name: "Sair da conta" }).click();
  expect((await logout).status()).toBe(204);
  await expect(page).toHaveURL(/\/login$/);

  // A sessão foi revogada no servidor: o refresh token antigo não serve mais.
  const refresh = await page.request.post("/api/auth/refresh");
  expect(refresh.status()).toBe(401);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);

  await login(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("access token inválido é renovado sozinho pelo refresh token", async ({ page, context }) => {
  await register(page, "Pessoa Refresh", uniqueEmail("refresh"));
  await context.addCookies([{ name: "patchnotes_token", value: "token-vencido", url: page.url() }]);

  const refreshed = page.waitForResponse((response) => response.url().endsWith("/api/auth/refresh"));
  await page.goto("/dashboard");
  expect((await refreshed).status()).toBe(200);
  await expect(page.getByText("Mensagens trocadas")).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("sem refresh token válido, o 401 encerra a sessão com aviso", async ({ page, context }) => {
  await register(page, "Pessoa Expirada", uniqueEmail("expirada"));
  await context.clearCookies({ name: "patchnotes_refresh" });
  await context.addCookies([{ name: "patchnotes_token", value: "token-vencido", url: page.url() }]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Sua sessão expirou")).toBeVisible();
});

test.describe("sem JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("enviar o login não coloca e-mail nem senha na URL", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", "alguem@patchnotes.dev");
    await page.fill("#password", "senha-que-nao-pode-vazar");
    await page.locator("form button[type=submit]").click();
    await page.waitForLoadState();
    expect(page.url()).not.toContain("senha-que-nao-pode-vazar");
    expect(page.url()).not.toContain("password=");
  });
});
