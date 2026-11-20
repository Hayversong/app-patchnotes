import { expect, type Page } from "@playwright/test";

export const PASSWORD = "senha-e2e-segura-1";

/** E-mail único por execução, para os testes não dependerem de dados anteriores. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@patchnotes.dev`;
}

/** Abre a página e espera o React hidratar (antes disso, o que for digitado se perde). */
export async function visit(page: Page, path: string) {
  await page.goto(path);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

/** Caixa de e-mail de desenvolvimento (Mailpit). A API manda o link de confirmação do cadastro para ela. */
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://localhost:8025";

/** Espera o e-mail para `email` chegar no Mailpit e devolve o caminho do link que contém `marker`. */
export async function linkFromEmail(email: string, marker: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages = [] } = (await search.json()) as { messages?: Array<{ ID: string }> };
    for (const { ID } of messages) {
      const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${ID}`)).json()) as { Text: string };
      const word = message.Text.split(/\s+/).find((item) => item.includes(marker));
      if (word) {
        const link = new URL(word.replace(/[.,;:)]+$/, "")); // pontuação da frase não faz parte do link
        return link.pathname + link.hash;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`nenhum e-mail com ${marker} chegou para ${email}`);
}

/** Cadastro completo: formulário → "confirme seu e-mail" → link do Mailpit → dashboard. */
export async function register(page: Page, name: string, email: string) {
  await visit(page, "/register");
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.fill("#passwordConfirmation", PASSWORD);
  await page.getByRole("button", { name: /criar conta|cadastrar/i }).click();
  await expect(page.getByText("Enviamos um link de confirmação")).toBeVisible();
  await page.goto(await linkFromEmail(email, "/verify-email#token="));
  await page.waitForURL("**/dashboard");
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await visit(page, "/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** Abre o chat e espera o WebSocket autenticar (botão habilitado). */
export async function openChat(page: Page) {
  await visit(page, "/chat");
  await expect(page.getByRole("button", { name: "Enviar mensagem" })).toBeEnabled({ timeout: 30_000 });
}

export function parseFrame(payload: string | Buffer): { type?: string } {
  try {
    return JSON.parse(String(payload)) as { type?: string };
  } catch {
    return {};
  }
}
