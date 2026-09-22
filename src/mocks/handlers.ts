import { delay, http, HttpResponse } from "msw";
import { z } from "zod";

import type { LoginRequest, RegisterRequest, User } from "@/modules/auth/types/auth.types";
import type { ChatMessage, GetChatHistoryResponse, SendChatRequest } from "@/modules/chat/types/chat.types";
import type { CreateDevlogRequest, DevlogEntry } from "@/modules/devlog/types/devlog.types";
import type { Profile, UpdateProfileRequest } from "@/modules/profile/types/profile.types";

type MockUser = User & { password: string };

const LoginBodySchema = z.object({ email: z.string().email(), password: z.string().min(8) });
const RegisterBodySchema = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8) });
const DevlogBodySchema = z.object({ title: z.string().min(1), content: z.string().min(1), tags: z.array(z.string()).optional() });
const ChatBodySchema = z.object({ message: z.string().min(1).max(2000), context: z.string().optional() });
const ProfileBodySchema = z.object({ name: z.string().min(2).optional(), bio: z.string().max(240).optional(), avatarUrl: z.union([z.string().url(), z.literal("")]).optional(), githubUrl: z.union([z.string().url(), z.literal("")]).optional() });

function invalidPayload(details: z.ZodError) {
  return HttpResponse.json({ error: "Payload inválido", details: details.flatten() }, { status: 400 });
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

function unauthorized() {
  return HttpResponse.json({ message: "Sessão inválida ou expirada" }, { status: 401 });
}

export const handlers = [
  http.post("/api/auth/login", async ({ request }) => {
    await delay(500);
    const parsed = LoginBodySchema.safeParse(await request.json());
    if (!parsed.success) return invalidPayload(parsed.error);
    const body: LoginRequest = parsed.data;
    const user = users.find((item) => item.email === body.email && item.password === body.password);
    if (!user) return HttpResponse.json({ message: "E-mail ou senha inválidos" }, { status: 401 });
    return HttpResponse.json({ user: publicUser(user), token: `mock-token-${user.id}` });
  }),

  http.post("/api/auth/register", async ({ request }) => {
    await delay(600);
    const parsed = RegisterBodySchema.safeParse(await request.json());
    if (!parsed.success) return invalidPayload(parsed.error);
    const body: RegisterRequest = parsed.data;
    if (users.some((item) => item.email === body.email)) {
      return HttpResponse.json({ message: "Este e-mail já está cadastrado" }, { status: 409 });
    }
    const user: MockUser = { id: crypto.randomUUID(), ...body };
    users.push(user);
    profiles.set(user.id, publicUser(user));
    return HttpResponse.json(
      { user: publicUser(user), token: `mock-token-${user.id}` },
      { status: 201 },
    );
  }),

  http.get("/api/auth/me", async ({ request }) => {
    await delay(200);
    const user = authenticatedUser(request);
    return user ? HttpResponse.json({ user: publicUser(user) }) : unauthorized();
  }),

  http.get("/api/dashboard/metrics", async ({ request }) => {
    await delay(350);
    if (!authenticatedUser(request)) return unauthorized();
    return HttpResponse.json({
      totalEntries: entries.length,
      tokensUsed,
      activeTime: "5h 26min",
      messagesExchanged: 42,
      streak: 4,
    });
  }),

  http.get("/api/dashboard/activity-heatmap", async ({ request }) => {
    await delay(250);
    if (!authenticatedUser(request)) return unauthorized();
    const today = new Date("2026-09-21T12:00:00Z");
    const counts = [0, 1, 2, 4, 1, 0, 3, 5, 2, 1, 0, 6, 3, 2, 7, 1, 0, 4, 2, 8, 3, 1, 5, 0, 2, 4, 1, 3, 6, 2];
    return HttpResponse.json({ days: Array.from({ length: 90 }, (_, index) => { const date = new Date(today); date.setUTCDate(today.getUTCDate() - (89 - index)); return { date: date.toISOString().slice(0, 10), count: counts[index % counts.length] }; }) });
  }),

  http.get("/api/dashboard/token-usage", async ({ request }) => {
    await delay(250);
    if (!authenticatedUser(request)) return unauthorized();
    const period = new URL(request.url).searchParams.get("period") === "30d" ? 30 : 7;
    const base = [820, 1460, 980, 2130, 1740, 2680, 1940, 2310, 1280, 1860];
    return HttpResponse.json({ points: Array.from({ length: period }, (_, index) => { const date = new Date("2026-09-21T12:00:00Z"); date.setUTCDate(date.getUTCDate() - (period - 1 - index)); return { date: date.toISOString().slice(0, 10), tokens: base[index % base.length] + (index * 73) % 500 }; }) });
  }),

  http.get("/api/dashboard/entries-by-tag", async ({ request }) => {
    await delay(250);
    if (!authenticatedUser(request)) return unauthorized();
    return HttpResponse.json({ tags: [{ tag: "gameplay", count: 18 }, { tag: "combate", count: 14 }, { tag: "física", count: 11 }, { tag: "player", count: 8 }, { tag: "UI", count: 6 }, { tag: "áudio", count: 3 }] });
  }),

  http.get("/api/devlog/entries", async ({ request }) => {
    await delay(350);
    if (!authenticatedUser(request)) return unauthorized();
    return HttpResponse.json({ entries });
  }),

  http.post("/api/devlog/entries", async ({ request }) => {
    await delay(500);
    if (!authenticatedUser(request)) return unauthorized();
    const parsed = DevlogBodySchema.safeParse(await request.json());
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
    return HttpResponse.json({ entry }, { status: 201 });
  }),

  http.post("/api/chat/send", async ({ request }) => {
    await delay(900);
    if (!authenticatedUser(request)) return unauthorized();
    const parsed = ChatBodySchema.safeParse(await request.json());
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
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      content: `Vamos desenvolver essa ideia: ${body.message}. Comece definindo a experiência principal do jogador, depois liste as regras e crie um protótipo pequeno para validar a mecânica.`,
      createdAt: new Date().toISOString(),
      tokensUsed: responseTokens,
    };
    messageStore.push(userMessage, assistantMessage);
    return HttpResponse.json(assistantMessage);
  }),

  http.get("/api/chat/history", ({ request }) => {
    if (!authenticatedUser(request)) return unauthorized();
    return HttpResponse.json<GetChatHistoryResponse>({ messages: messageStore });
  }),

  http.get("/api/profile", async ({ request }) => {
    await delay(300);
    const authUser = authenticatedUser(request);
    if (!authUser) return unauthorized();
    return HttpResponse.json({ user: profiles.get(authUser.id) ?? publicUser(authUser) });
  }),

  http.patch("/api/profile", async ({ request }) => {
    await delay(500);
    const authUser = authenticatedUser(request);
    if (!authUser) return unauthorized();
    const parsed = ProfileBodySchema.safeParse(await request.json());
    if (!parsed.success) return invalidPayload(parsed.error);
    const body: UpdateProfileRequest = parsed.data;
    const currentProfile = profiles.get(authUser.id) ?? publicUser(authUser);
    const updatedProfile = { ...currentProfile, ...body };
    profiles.set(authUser.id, updatedProfile);
    authUser.name = updatedProfile.name;
    authUser.avatarUrl = updatedProfile.avatarUrl;
    return HttpResponse.json({ user: updatedProfile });
  }),
];
