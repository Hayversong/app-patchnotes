import { delay, http, HttpResponse } from "msw";
import { z } from "zod";

import type { AuthResponse, CurrentUserResponse, LoginRequest, MessageResponse, RegisterRequest, User } from "@/modules/auth/types/auth.types";
import type { ChatMessage, GetChatHistoryResponse, SendChatRequest, SendChatResponse } from "@/modules/chat/types/chat.types";
import type { ActivityHeatmapResponse, DashboardMetrics, EntriesByTagResponse, TokenUsageResponse } from "@/modules/dashboard/types/dashboard.types";
import type { CreateDevlogRequest, CreateDevlogResponse, DevlogEntriesResponse, DevlogEntry } from "@/modules/devlog/types/devlog.types";
import type { Profile, ProfileResponse, UpdateProfileRequest } from "@/modules/profile/types/profile.types";
import type { ApiErrorResponse } from "@/shared/types/api.types";

import { readScenarioHeader } from "./scenarios";

/**
 * Handlers MSW — implementação de referência de `docs/API_CONTRACTS.md`.
 * O padrão `*` casa qualquer origem, então os mesmos handlers servem ao
 * navegador (setupWorker) e ao Node (setupServer, nos testes).
 */
const API = "*/api";

type MockUser = User & { password: string };

const optionalUrl = z.union([z.string().url(), z.literal("")]);
const LoginBodySchema = z.object({ email: z.string().email(), password: z.string().min(8) });
const RegisterBodySchema = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8) });
const DevlogBodySchema = z.object({ title: z.string().min(3), content: z.string().min(10), tags: z.array(z.string().min(1)).optional() });
const ChatBodySchema = z.object({ message: z.string().min(1).max(2000), context: z.string().optional() });
const ForgotPasswordBodySchema = z.object({ email: z.string().email() });
const ResetPasswordBodySchema = z.object({ token: z.string().min(20), password: z.string().min(8).max(128) });
const ProfileBodySchema = z.object({ name: z.string().min(2).optional(), bio: z.string().max(240).optional(), avatarUrl: optionalUrl.optional(), githubUrl: optionalUrl.optional() });

function errorResponse(status: number, body: ApiErrorResponse): Response {
  return HttpResponse.json<ApiErrorResponse>(body, { status });
}

function invalidPayload(error?: z.ZodError): Response {
  return errorResponse(400, {
    message: "Dados inválidos. Revise os campos e tente novamente.",
    details: error ? z.flattenError(error) : { formErrors: ["Payload rejeitado pelo cenário simulado."], fieldErrors: {} },
  });
}

function unauthorized(): Response {
  return errorResponse(401, { message: "Sessão inválida ou expirada. Entre novamente." });
}

function serverError(): Response {
  return errorResponse(500, { message: "O servidor encontrou um erro inesperado. Tente novamente em instantes." });
}

/** Lê o corpo JSON sem lançar exceção: corpo ausente ou malformado vira `undefined` (→ 400). */
async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/**
 * Aplica o cenário forçado pelo cabeçalho `X-Mock-Scenario`.
 * `invalid-payload` só se aplica a mutações; `empty` é tratado em cada handler de leitura.
 */
function forcedScenario(request: Request, kind: "query" | "mutation") {
  const scenario = readScenarioHeader(request);
  if (scenario === "server-error") return serverError();
  if (scenario === "unauthorized") return unauthorized();
  if (scenario === "invalid-payload" && kind === "mutation") return invalidPayload();
  return undefined;
}

function wantsEmpty(request: Request) {
  return readScenarioHeader(request) === "empty";
}

const users: MockUser[] = [
  { id: "user-1", name: "Hayverson", email: "hayverson@patchnotes.dev", password: "patchnotes123" },
];

const profiles = new Map<string, Profile>([
  ["user-1", {
    id: "user-1",
    name: "Hayverson",
    email: "hayverson@patchnotes.dev",
    bio: "Desenvolvedor de jogos e estudante de Ciência da Computação.",
    githubUrl: "https://github.com/",
  }],
]);

let entries: DevlogEntry[] = [
  {
    id: "entry-2",
    title: "Protótipo de combate",
    content: "Ajustei o tempo de recuperação dos ataques e melhorei o feedback de impacto.",
    tags: ["combate", "gameplay"],
    createdAt: "2026-09-17T18:30:00.000Z",
  },
  {
    id: "entry-1",
    title: "Movimentação do jogador",
    content: "Implementei aceleração gradual e corrigi a colisão nas plataformas inclinadas.",
    tags: ["player", "física"],
    createdAt: "2026-09-16T20:15:00.000Z",
  },
];

/** Token de redefinição aceito pelo mock (o backend real envia um token aleatório por e-mail). */
export const MOCK_RESET_TOKEN = "token-de-redefinicao-do-mock-0001";
const FORGOT_PASSWORD_MESSAGE = "Se o e-mail estiver cadastrado, você receberá as instruções para redefinir a senha.";

let tokensUsed = 12480;
const messageStore: ChatMessage[] = [];

function publicUser(user: MockUser): User {
  return { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl };
}

function authenticatedUser(request: Request): MockUser | undefined {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  const userId = token?.replace("mock-token-", "");
  return users.find((user) => user.id === userId);
}

export const handlers = [
  http.post(`${API}/auth/login`, async ({ request }) => {
    await delay(500);
    const forced = forcedScenario(request, "mutation");
    if (forced) return forced;
    const parsed = LoginBodySchema.safeParse(await readJson(request));
    if (!parsed.success) return invalidPayload(parsed.error);
    const body: LoginRequest = parsed.data;
    const user = users.find((item) => item.email === body.email && item.password === body.password);
    if (!user) return errorResponse(401, { message: "E-mail ou senha inválidos" });
    return HttpResponse.json<AuthResponse>({ user: publicUser(user), token: `mock-token-${user.id}` });
  }),

  http.post(`${API}/auth/register`, async ({ request }) => {
    await delay(600);
    const forced = forcedScenario(request, "mutation");
    if (forced) return forced;
    const parsed = RegisterBodySchema.safeParse(await readJson(request));
    if (!parsed.success) return invalidPayload(parsed.error);
    const body: RegisterRequest = parsed.data;
    if (users.some((item) => item.email === body.email)) {
      return errorResponse(409, { message: "Este e-mail já está cadastrado" });
    }
    const user: MockUser = { id: crypto.randomUUID(), ...body };
    users.push(user);
    profiles.set(user.id, publicUser(user));
    return HttpResponse.json<AuthResponse>({ user: publicUser(user), token: `mock-token-${user.id}` }, { status: 201 });
  }),

  // O mock não mantém refresh tokens: o refresh sempre falha (401) e a sessão expira como antes.
  http.post(`${API}/auth/refresh`, async ({ request }) => {
    await delay(200);
    const forced = forcedScenario(request, "mutation");
    if (forced) return forced;
    return unauthorized();
  }),

  http.post(`${API}/auth/logout`, async ({ request }) => {
    await delay(150);
    const forced = forcedScenario(request, "mutation");
    if (forced) return forced;
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API}/auth/forgot-password`, async ({ request }) => {
    await delay(500);
    const forced = forcedScenario(request, "mutation");
    if (forced) return forced;
    const parsed = ForgotPasswordBodySchema.safeParse(await readJson(request));
    if (!parsed.success) return invalidPayload(parsed.error);
    // Mesma resposta exista ou não a conta (não revela cadastros).
    return HttpResponse.json<MessageResponse>({ message: FORGOT_PASSWORD_MESSAGE }, { status: 202 });
  }),

  http.post(`${API}/auth/reset-password`, async ({ request }) => {
    await delay(500);
    const forced = forcedScenario(request, "mutation");
    if (forced) return forced;
    const parsed = ResetPasswordBodySchema.safeParse(await readJson(request));
    if (!parsed.success) return invalidPayload(parsed.error);
    if (parsed.data.token !== MOCK_RESET_TOKEN) {
      return errorResponse(400, { message: "Link de redefinição inválido ou expirado. Solicite um novo." });
    }
    users[0].password = parsed.data.password;
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API}/auth/me`, async ({ request }) => {
    await delay(200);
    const forced = forcedScenario(request, "query");
    if (forced) return forced;
    const user = authenticatedUser(request);
    return user ? HttpResponse.json<CurrentUserResponse>({ user: publicUser(user) }) : unauthorized();
  }),

  http.get(`${API}/dashboard/metrics`, async ({ request }) => {
    await delay(350);
    const forced = forcedScenario(request, "query");
    if (forced) return forced;
    if (!authenticatedUser(request)) return unauthorized();
    if (wantsEmpty(request)) {
      return HttpResponse.json<DashboardMetrics>({ totalEntries: 0, tokensUsed: 0, activeTime: "0min", messagesExchanged: 0, streak: 0 });
    }
    return HttpResponse.json<DashboardMetrics>({
      totalEntries: entries.length,
      tokensUsed,
      activeTime: "5h 26min",
      messagesExchanged: 42,
      streak: 4,
    });
  }),

  http.get(`${API}/dashboard/activity-heatmap`, async ({ request }) => {
    await delay(250);
    const forced = forcedScenario(request, "query");
    if (forced) return forced;
    if (!authenticatedUser(request)) return unauthorized();
    if (wantsEmpty(request)) return HttpResponse.json<ActivityHeatmapResponse>({ days: [] });
    const today = new Date("2026-09-21T12:00:00Z");
    const counts = [0, 1, 2, 4, 1, 0, 3, 5, 2, 1, 0, 6, 3, 2, 7, 1, 0, 4, 2, 8, 3, 1, 5, 0, 2, 4, 1, 3, 6, 2];
    return HttpResponse.json<ActivityHeatmapResponse>({ days: Array.from({ length: 90 }, (_, index) => { const date = new Date(today); date.setUTCDate(today.getUTCDate() - (89 - index)); return { date: date.toISOString().slice(0, 10), count: counts[index % counts.length] }; }) });
  }),

  http.get(`${API}/dashboard/token-usage`, async ({ request }) => {
    await delay(250);
    const forced = forcedScenario(request, "query");
    if (forced) return forced;
    if (!authenticatedUser(request)) return unauthorized();
    if (wantsEmpty(request)) return HttpResponse.json<TokenUsageResponse>({ points: [] });
    const period = new URL(request.url).searchParams.get("period") === "30d" ? 30 : 7;
    const base = [820, 1460, 980, 2130, 1740, 2680, 1940, 2310, 1280, 1860];
    return HttpResponse.json<TokenUsageResponse>({ points: Array.from({ length: period }, (_, index) => { const date = new Date("2026-09-21T12:00:00Z"); date.setUTCDate(date.getUTCDate() - (period - 1 - index)); return { date: date.toISOString().slice(0, 10), tokens: base[index % base.length] + (index * 73) % 500 }; }) });
  }),

  http.get(`${API}/dashboard/entries-by-tag`, async ({ request }) => {
    await delay(250);
    const forced = forcedScenario(request, "query");
    if (forced) return forced;
    if (!authenticatedUser(request)) return unauthorized();
    if (wantsEmpty(request)) return HttpResponse.json<EntriesByTagResponse>({ tags: [] });
    return HttpResponse.json<EntriesByTagResponse>({ tags: [{ tag: "gameplay", count: 18 }, { tag: "combate", count: 14 }, { tag: "física", count: 11 }, { tag: "player", count: 8 }, { tag: "UI", count: 6 }, { tag: "áudio", count: 3 }] });
  }),

  http.get(`${API}/devlog/entries`, async ({ request }) => {
    await delay(350);
    const forced = forcedScenario(request, "query");
    if (forced) return forced;
    if (!authenticatedUser(request)) return unauthorized();
    return HttpResponse.json<DevlogEntriesResponse>({ entries: wantsEmpty(request) ? [] : entries });
  }),

  http.post(`${API}/devlog/entries`, async ({ request }) => {
    await delay(500);
    const forced = forcedScenario(request, "mutation");
    if (forced) return forced;
    if (!authenticatedUser(request)) return unauthorized();
    const parsed = DevlogBodySchema.safeParse(await readJson(request));
    if (!parsed.success) return invalidPayload(parsed.error);
    const body: CreateDevlogRequest = parsed.data;
    const entry: DevlogEntry = {
      id: crypto.randomUUID(),
      title: body.title,
      content: body.content,
      tags: body.tags ?? [],
      createdAt: new Date().toISOString(),
    };
    entries = [entry, ...entries];
    return HttpResponse.json<CreateDevlogResponse>({ entry }, { status: 201 });
  }),

  http.post(`${API}/chat/send`, async ({ request }) => {
    await delay(900);
    const forced = forcedScenario(request, "mutation");
    if (forced) return forced;
    if (!authenticatedUser(request)) return unauthorized();
    const parsed = ChatBodySchema.safeParse(await readJson(request));
    if (!parsed.success) return invalidPayload(parsed.error);
    const body: SendChatRequest = parsed.data;
    const responseTokens = Math.max(24, Math.ceil(body.message.length * 1.8));
    tokensUsed += responseTokens;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: body.message,
      createdAt: new Date().toISOString(),
    };
    const assistantMessage: SendChatResponse = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `Vamos desenvolver essa ideia: ${body.message}. Comece definindo a experiência principal do jogador, depois liste as regras e crie um protótipo pequeno para validar a mecânica.`,
      createdAt: new Date().toISOString(),
      tokensUsed: responseTokens,
    };
    messageStore.push(userMessage, assistantMessage);
    return HttpResponse.json<SendChatResponse>(assistantMessage);
  }),

  http.get(`${API}/chat/history`, async ({ request }) => {
    await delay(250);
    const forced = forcedScenario(request, "query");
    if (forced) return forced;
    if (!authenticatedUser(request)) return unauthorized();
    return HttpResponse.json<GetChatHistoryResponse>({ messages: wantsEmpty(request) ? [] : messageStore });
  }),

  http.get(`${API}/profile`, async ({ request }) => {
    await delay(300);
    const forced = forcedScenario(request, "query");
    if (forced) return forced;
    const authUser = authenticatedUser(request);
    if (!authUser) return unauthorized();
    // "Vazio" para perfil = apenas os campos obrigatórios, sem bio, avatar ou GitHub.
    const user = wantsEmpty(request) ? { id: authUser.id, name: authUser.name, email: authUser.email } : profiles.get(authUser.id) ?? publicUser(authUser);
    return HttpResponse.json<ProfileResponse>({ user });
  }),

  http.patch(`${API}/profile`, async ({ request }) => {
    await delay(500);
    const forced = forcedScenario(request, "mutation");
    if (forced) return forced;
    const authUser = authenticatedUser(request);
    if (!authUser) return unauthorized();
    const parsed = ProfileBodySchema.safeParse(await readJson(request));
    if (!parsed.success) return invalidPayload(parsed.error);
    const body: UpdateProfileRequest = parsed.data;
    const currentProfile = profiles.get(authUser.id) ?? publicUser(authUser);
    const updatedProfile: Profile = { ...currentProfile, ...body };
    profiles.set(authUser.id, updatedProfile);
    authUser.name = updatedProfile.name;
    authUser.avatarUrl = updatedProfile.avatarUrl;
    return HttpResponse.json<ProfileResponse>({ user: updatedProfile });
  }),
];
