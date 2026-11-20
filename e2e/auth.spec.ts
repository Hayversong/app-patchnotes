import { expect, test } from "@playwright/test";

import { linkFromEmail, login, PASSWORD, register, uniqueEmail, visit } from "./helpers";

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
  const url = page.url();
  await page.goto("about:blank");
  await context.addCookies([{ name: "patchnotes_access", value: "token-vencido", url, httpOnly: true, sameSite: "Strict" }]);

  const refreshed = page.waitForResponse((response) => response.url().endsWith("/api/auth/refresh"));
  await page.goto("/dashboard");
  expect((await refreshed).status()).toBe(200);
  await expect(page.getByText("Mensagens trocadas")).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("sem refresh token válido, o 401 encerra a sessão com aviso", async ({ page, context }) => {
  await register(page, "Pessoa Expirada", uniqueEmail("expirada"));
  const url = page.url();
  await page.goto("about:blank"); // sem o app aberto, nada mexe nos cookies enquanto o teste os troca
  await context.clearCookies({ name: "patchnotes_refresh" });
  await context.addCookies([{ name: "patchnotes_access", value: "token-vencido", url, httpOnly: true, sameSite: "Strict" }]);
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


test("o access token fica em cookie HttpOnly, fora do alcance do JavaScript", async ({ page, context }) => {
  await register(page, "Pessoa Cookie", uniqueEmail("cookie"));
  const access = (await context.cookies()).find((cookie) => cookie.name === "patchnotes_access");
  expect(access).toMatchObject({ httpOnly: true, sameSite: "Strict" });
  const visible = await page.evaluate(() => document.cookie);
  expect(visible).not.toContain("patchnotes_access");
  expect(visible).not.toContain("patchnotes_refresh");
  expect(visible).not.toMatch(/eyJ[\w-]+\.[\w-]+\./); // nenhum JWT legível
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toMatch(/eyJ/);
});

test("cadastro com e-mail já usado responde igual e não entra na conta de ninguém", async ({ page }) => {
  const email = uniqueEmail("repetido");
  await register(page, "Dona do e-mail", email);
  await page.goto("about:blank"); // sem o app aberto reagindo à troca de cookies
  await page.context().clearCookies();

  await visit(page, "/register");
  await page.fill("#name", "Outra pessoa");
  await page.fill("#email", email);
  await page.fill("#password", "outra-senha-123");
  await page.fill("#passwordConfirmation", "outra-senha-123");
  await page.getByRole("button", { name: /criar conta/i }).click();
  await expect(page.getByText("Enviamos um link de confirmação")).toBeVisible(); // mesma resposta de um e-mail novo
  await expect(page).toHaveURL(/\/register$/);
  // A dona recebe um aviso, sem link de confirmação.
  await expect(linkFromEmail(email, "/login")).resolves.toBe("/login");
});

test("link de confirmação só funciona uma vez", async ({ page }) => {
  const email = uniqueEmail("uso-unico");
  await visit(page, "/register");
  await page.fill("#name", "Uso Único");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.fill("#passwordConfirmation", PASSWORD);
  await page.getByRole("button", { name: /criar conta/i }).click();
  const link = await linkFromEmail(email, "/verify-email#token=");
  await page.goto(link);
  await page.waitForURL("**/dashboard");
  await page.goto("about:blank"); // sem o app aberto reagindo à troca de cookies
  await page.context().clearCookies();
  await page.goto(link);
  await expect(page.getByText(/inválido ou expirado/)).toBeVisible();
});
