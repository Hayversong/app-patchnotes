import { expect, test } from "@playwright/test";

const screens = [
  { path: "/dashboard", ready: "Mensagens trocadas" },
  { path: "/chat", ready: "Sua mensagem" },
  { path: "/devlog", ready: "Nova entrada" },
  { path: "/tokens", ready: "Saldo atual" },
  { path: "/profile", ready: "Salvar alterações" },
];

test("todas as telas carregam da API real sem erros no console nem violação de CSP", async ({ page }) => {
  const problems: string[] = [];
  const apiFailures: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") problems.push(`${page.url()}: ${message.text()}`); });
  page.on("pageerror", (error) => problems.push(`${page.url()}: ${error.message}`));
  page.on("response", (response) => { if (response.url().includes("/api/") && response.status() >= 400) apiFailures.push(`${response.status()} ${response.url()}`); });

  for (const screen of screens) {
    await page.goto(screen.path);
    await expect(page.getByText(screen.ready).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
  }
  expect(problems).toEqual([]);
  expect(apiFailures).toEqual([]);
  expect(await page.evaluate(async () => (await navigator.serviceWorker?.getRegistrations())?.length ?? 0)).toBe(0);
});

test("erro 500 mostra mensagem e o botão de tentar de novo recupera a tela", async ({ page }) => {
  await page.route("**/api/dashboard/metrics", (route) => route.fulfill({ status: 500, json: { message: "O servidor encontrou um erro inesperado." } }));
  await page.goto("/dashboard");
  await expect(page.getByText("Não foi possível carregar seu resumo.")).toBeVisible();
  await page.unroute("**/api/dashboard/metrics");
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByText("Mensagens trocadas")).toBeVisible();
});

test("devlog salva na API e aparece na lista e no dashboard", async ({ page }) => {
  const title = `Entrada E2E ${Date.now()}`;
  await page.goto("/devlog");
  await page.fill("#title", title);
  await page.fill("#content", "Ajustei o tempo de coyote no pulo.");
  await page.fill("#tags", "e2e, gameplay");
  await page.getByRole("button", { name: "Salvar entrada" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByText(title)).toBeVisible();
});

test("perfil salva na API e continua depois de recarregar", async ({ page }) => {
  const bio = `Bio E2E ${Date.now()}`;
  await page.goto("/profile");
  await page.fill("#bio", bio);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status").filter({ hasText: /salv|atualiz/i })).toBeVisible();
  await page.reload();
  await expect(page.locator("#bio")).toHaveValue(bio);
});

test("layout em tela de celular sem rolagem horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/dashboard", "/chat", "/tokens"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
