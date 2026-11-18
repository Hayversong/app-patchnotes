import { expect, type Page } from "@playwright/test";

export const PASSWORD = "senha-e2e-segura-1";

/** E-mail único por execução, para os testes não dependerem de dados anteriores. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@patchnotes.dev`;
}

export async function register(page: Page, name: string, email: string) {
  await page.goto("/register");
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.fill("#passwordConfirmation", PASSWORD);
  await page.getByRole("button", { name: /criar conta|cadastrar/i }).click();
  await page.waitForURL("**/dashboard");
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** Abre o chat e espera o WebSocket autenticar (botão habilitado). */
export async function openChat(page: Page) {
  await page.goto("/chat");
  await expect(page.getByRole("button", { name: "Enviar mensagem" })).toBeEnabled({ timeout: 30_000 });
}

export function parseFrame(payload: string | Buffer): { type?: string } {
  try {
    return JSON.parse(String(payload)) as { type?: string };
  } catch {
    return {};
  }
}
