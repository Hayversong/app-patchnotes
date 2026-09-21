import { delay, http, HttpResponse } from "msw";

import type { LoginRequest, RegisterRequest, User } from "@/modules/auth/types/auth.types";
import type { SendChatRequest } from "@/modules/chat/types/chat.types";
import type { CreateDevlogRequest, DevlogEntry } from "@/modules/devlog/types/devlog.types";
import type { Profile, UpdateProfileRequest } from "@/modules/profile/types/profile.types";

type MockUser = User & { password: string };

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
    const body = (await request.json()) as LoginRequest;
    const user = users.find((item) => item.email === body.email && item.password === body.password);
    if (!user) return HttpResponse.json({ message: "E-mail ou senha inválidos" }, { status: 401 });
    return HttpResponse.json({ user: publicUser(user), token: `mock-token-${user.id}` });
  }),

  http.post("/api/auth/register", async ({ request }) => {
    await delay(600);
    const body = (await request.json()) as RegisterRequest;
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
    });
  }),

  http.get("/api/devlog/entries", async ({ request }) => {
    await delay(350);
    if (!authenticatedUser(request)) return unauthorized();
    return HttpResponse.json({ entries });
  }),

  http.post("/api/devlog/entries", async ({ request }) => {
    await delay(500);
    if (!authenticatedUser(request)) return unauthorized();
    const body = (await request.json()) as CreateDevlogRequest;
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
    const body = (await request.json()) as SendChatRequest;
    const responseTokens = Math.max(24, Math.ceil(body.message.length * 1.8));
    tokensUsed += responseTokens;
    return HttpResponse.json({
      id: crypto.randomUUID(),
      role: "assistant" as const,
      content: `Vamos desenvolver essa ideia: ${body.message}. Comece definindo a experiência principal do jogador, depois liste as regras e crie um protótipo pequeno para validar a mecânica.`,
      tokensUsed: responseTokens,
    });
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
    const body = (await request.json()) as UpdateProfileRequest;
    const currentProfile = profiles.get(authUser.id) ?? publicUser(authUser);
    const updatedProfile = { ...currentProfile, ...body };
    profiles.set(authUser.id, updatedProfile);
    authUser.name = updatedProfile.name;
    authUser.avatarUrl = updatedProfile.avatarUrl;
    return HttpResponse.json({ user: updatedProfile });
  }),
];
