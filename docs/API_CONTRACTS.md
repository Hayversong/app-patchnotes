# Contratos da API — Patchnotes

Este documento é a **fonte única** dos contratos HTTP entre o frontend e a API. Na Parte 1, a API é simulada pelo MSW; o backend da Parte 2 deve implementar exatamente estes contratos para que as telas funcionem sem reescrita.

Referências de implementação (devem permanecer alinhadas a este documento):

| Camada | Arquivos |
|---|---|
| Tipos | `src/modules/*/types/*.types.ts`, `src/shared/types/api.types.ts` |
| Serviços (Axios) | `src/modules/*/services/*.service.ts`, cliente em `src/lib/axios.ts` |
| Handlers MSW | `src/mocks/handlers.ts` |
| Testes de contrato | `src/mocks/__tests__/handlers.test.ts` (`npm run test:mocks`) |

> Mudanças de contrato devem ser feitas **primeiro aqui**, depois nos tipos, handlers e testes. Não altere um contrato para acomodar uma tela sem registrar a mudança neste arquivo.

## Convenções gerais

- **Base URL:** `/api` (o Axios usa `baseURL: "/api"`; os caminhos abaixo são relativos a ela).
- **Formato:** JSON (`Content-Type: application/json`) em requisições e respostas. Datas em ISO 8601 (`2026-09-17T18:30:00.000Z`); datas sem hora em `YYYY-MM-DD`.
- **Campos opcionais** podem ser omitidos da resposta (não são enviados como `null`).
- **Autenticação:** endpoints marcados com 🔒 exigem `Authorization: Bearer <token>`. O token é devolvido por `POST /auth/login` e `POST /auth/register`. O frontend o guarda num cookie `patchnotes_token` (lido pelo middleware do Next para proteger rotas) e o injeta via interceptor do Axios.
  - No mock, o token tem o formato `mock-token-<userId>`. O frontend trata o token como **opaco**; o backend real pode usar JWT ou outro formato.
- **401 em endpoint protegido:** o interceptor do Axios encerra a sessão (remove o cookie) e o app redireciona para `/login`, que avisa "Sua sessão expirou".

### Corpo de erro

Toda resposta 4xx/5xx usa o mesmo formato (`ApiErrorResponse`):

```ts
type ApiErrorResponse = {
  message: string;                 // texto pronto para exibir ao usuário (pt-BR)
  details?: {                      // presente em 400
    formErrors: string[];
    fieldErrors: Partial<Record<string, string[]>>;
  };
};
```

```json
{
  "message": "Dados inválidos. Revise os campos e tente novamente.",
  "details": { "formErrors": [], "fieldErrors": { "title": ["Too small: expected string to have >=3 characters"] } }
}
```

A UI exibe `message` (via `getApiErrorMessage`) e preserva o que o usuário digitou.

### Códigos de status

| Status | Quando | Comportamento esperado na UI |
|---|---|---|
| 200 / 201 | Sucesso (201 em criações) | Exibe os dados / confirma a ação |
| 400 | Corpo ausente, JSON malformado ou falha de validação | Mensagem de erro; campos preservados |
| 401 | Sem token, token inválido/expirado, ou credenciais incorretas no login | Protegidos: sessão encerrada → `/login`. Login: mensagem do servidor |
| 409 | Conflito (e-mail já cadastrado) | Mensagem do servidor |
| 500 | Falha inesperada do servidor | Estado de erro com **Tentar novamente**; consultas fazem 1 retry automático |
| 403 | *(Parte 2)* `Origin` não autorizado em `/auth/refresh` e `/auth/logout` | Mensagem do servidor |
| 413 | *(Parte 2)* Corpo da requisição maior que 64 KB | Mensagem do servidor |
| 429 | *(Parte 2)* Limite de requisições atingido (login, cadastro, recuperação, chat, criação de devlog, edição de perfil) ou cota mensal de tokens esgotada (chat) | Mensagem do servidor; texto preservado |
| 503 / 504 | *(Parte 2)* Chat: LLM indisponível / demorou demais. 503 também quando o armazenamento dos limites de requisição (Redis) está fora do ar, em qualquer rota limitada | Mensagem do servidor; texto preservado |

Consultas (React Query) **não** repetem automaticamente erros 4xx; repetem uma vez erros 5xx/rede.

---

## Auth

### `POST /auth/login`

Autentica e devolve a sessão.

| Campo | Tipo | Regras |
|---|---|---|
| `email` | string | e-mail válido |
| `password` | string | mínimo 8 caracteres |

```json
// Requisição
{ "email": "hayverson@patchnotes.dev", "password": "patchnotes123" }
// 200
{ "user": { "id": "user-1", "name": "Hayverson", "email": "hayverson@patchnotes.dev" }, "token": "mock-token-user-1" }
```

Erros: `400` payload inválido · `401` `{ "message": "E-mail ou senha inválidos" }` · `500`.

### `POST /auth/register`

Cria a conta e já devolve a sessão (o usuário entra direto no dashboard). A confirmação de senha é validada **apenas no cliente** e não é enviada.

| Campo | Tipo | Regras |
|---|---|---|
| `name` | string | mínimo 2 caracteres |
| `email` | string | e-mail válido, único |
| `password` | string | mínimo 8 caracteres |

```json
// Requisição
{ "name": "Ada", "email": "ada@patchnotes.dev", "password": "senha-segura" }
// 201
{ "user": { "id": "3f2c…", "name": "Ada", "email": "ada@patchnotes.dev" }, "token": "mock-token-3f2c…" }
```

Erros: `400` · `409` `{ "message": "Este e-mail já está cadastrado" }` · `500`.

### `GET /auth/me` 🔒

Usuário da sessão atual (usado pelo shell autenticado).

```json
// 200
{ "user": { "id": "user-1", "name": "Hayverson", "email": "hayverson@patchnotes.dev", "avatarUrl": "https://…" } }
```

`User = { id: string; name: string; email: string; avatarUrl?: string }`

Erros: `401` · `500`.

---

## Dashboard

### `GET /dashboard/metrics` 🔒

```json
// 200
{ "totalEntries": 2, "tokensUsed": 12480, "activeTime": "5h 26min", "messagesExchanged": 42, "streak": 4 }
```

| Campo | Tipo | Significado |
|---|---|---|
| `totalEntries` | number | entradas de devlog do usuário |
| `tokensUsed` | number | tokens consumidos pelo assistente |
| `activeTime` | string | tempo de uso já formatado para exibição (ex.: `"5h 26min"`, `"0min"`) |
| `messagesExchanged` | number | mensagens trocadas com o assistente |
| `streak` | number | dias seguidos com atividade |

Vazio: todos os números `0` e `activeTime: "0min"`. Erros: `401` · `500`.

### `GET /dashboard/activity-heatmap` 🔒

Atividade diária (últimos 90 dias, ordem cronológica).

```json
{ "days": [{ "date": "2026-06-24", "count": 0 }, { "date": "2026-06-25", "count": 3 }] }
```

Vazio: `{ "days": [] }`. Erros: `401` · `500`.

### `GET /dashboard/token-usage?period=7d|30d` 🔒

| Query | Valores | Padrão |
|---|---|---|
| `period` | `7d` ou `30d` | `7d` (qualquer outro valor é tratado como `7d`) |

```json
{ "points": [{ "date": "2026-09-15", "tokens": 820 }, { "date": "2026-09-16", "tokens": 1533 }] }
```

Um ponto por dia do período, em ordem cronológica. Vazio: `{ "points": [] }`. Erros: `401` · `500`.

### `GET /dashboard/entries-by-tag` 🔒

```json
{ "tags": [{ "tag": "gameplay", "count": 18 }, { "tag": "combate", "count": 14 }] }
```

A ordem não é garantida (a UI ordena por `count`). Vazio: `{ "tags": [] }`. Erros: `401` · `500`.

---

## Devlog

`DevlogEntry = { id: string; title: string; content: string; tags: string[]; createdAt: string }`

### `GET /devlog/entries` 🔒

Entradas do usuário, **mais recentes primeiro**.

```json
{ "entries": [{ "id": "entry-2", "title": "Protótipo de combate", "content": "Ajustei o tempo de recuperação…", "tags": ["combate", "gameplay"], "createdAt": "2026-09-17T18:30:00.000Z" }] }
```

Vazio: `{ "entries": [] }`. Erros: `401` · `500`.

*(Parte 2, mudança aprovada e compatível)* **Paginação opcional:**

| Query | Tipo | Regras |
|---|---|---|
| `limit` | number | 1 a 100; padrão 100 |
| `cursor` | string | valor de `nextCursor` da página anterior (opaco) |

A resposta ganha `nextCursor?: string`, presente **só** quando há mais páginas. Sem parâmetros, a resposta tem o formato da Parte 1 com as **100 entradas mais recentes**; o frontend atual (que não pagina) continua funcionando, mas só mostra essas 100. A ordem é estável mesmo com entradas criadas entre as páginas (keyset por `createdAt` e `id`). Erros: `400` (`limit` fora do intervalo ou `cursor` inválido, com `details.fieldErrors`).

```json
// GET /devlog/entries?limit=2
{ "entries": [{ "id": "…", "title": "…", "content": "…", "tags": [], "createdAt": "…" }, { "…": "…" }], "nextCursor": "eyJ0IjoiMjAyNi0xMS0wMlQxMDowMDowMCswMDowMCIsImkiOiI…" }
```

### `POST /devlog/entries` 🔒

| Campo | Tipo | Regras |
|---|---|---|
| `title` | string | mínimo 3 caracteres |
| `content` | string | mínimo 10 caracteres |
| `tags` | string[] | opcional; itens não vazios. Ausente → `[]` |

```json
// Requisição
{ "title": "Movimentação", "content": "Implementei aceleração gradual.", "tags": ["player", "física"] }
// 201
{ "entry": { "id": "9b1e…", "title": "Movimentação", "content": "Implementei aceleração gradual.", "tags": ["player", "física"], "createdAt": "2026-11-12T14:03:00.000Z" } }
```

Erros: `400` · `401` · `500`.

---

## Chat

`ChatMessage = { id: string; role: "user" | "assistant"; content: string; createdAt: string; tokensUsed?: number }`

### `GET /chat/history` 🔒

Mensagens da conversa em **ordem cronológica** (mais antiga primeiro), incluindo as do usuário e do assistente.

```json
{ "messages": [
  { "id": "a1", "role": "user", "content": "Como melhorar o combate?", "createdAt": "2026-11-12T14:00:00.000Z" },
  { "id": "a2", "role": "assistant", "content": "Vamos desenvolver essa ideia…", "createdAt": "2026-11-12T14:00:01.000Z", "tokensUsed": 43 }
] }
```

Vazio: `{ "messages": [] }`. Erros: `401` · `500`.

### `POST /chat/send` 🔒

Envia uma mensagem e devolve a **resposta do assistente** (não embrulhada). O servidor grava a mensagem do usuário e a resposta no histórico; o frontend recarrega `GET /chat/history` após o sucesso.

| Campo | Tipo | Regras |
|---|---|---|
| `message` | string | 1 a 2.000 caracteres |
| `context` | string | opcional (reservado para contexto extra do assistente) |

```json
// Requisição
{ "message": "Como melhorar o combate?" }
// 200 — SendChatResponse = ChatMessage & { role: "assistant"; tokensUsed: number }
{ "id": "a2", "role": "assistant", "content": "Vamos desenvolver essa ideia…", "createdAt": "2026-11-12T14:00:01.000Z", "tokensUsed": 43 }
```

Efeito colateral: incrementa `tokensUsed` em `/dashboard/metrics`. Erros: `400` · `401` · `500` (a UI mantém o texto digitado).

---

## Perfil

`Profile = User & { bio?: string; githubUrl?: string }`

### `GET /profile` 🔒

```json
{ "user": { "id": "user-1", "name": "Hayverson", "email": "hayverson@patchnotes.dev", "bio": "Desenvolvedor de jogos…", "githubUrl": "https://github.com/" } }
```

Vazio (perfil sem dados opcionais): `{ "user": { "id", "name", "email" } }`. Erros: `401` · `500`.

### `PATCH /profile` 🔒

Atualização parcial: apenas os campos enviados mudam. `email` não é editável.

| Campo | Tipo | Regras |
|---|---|---|
| `name` | string | opcional; mínimo 2 caracteres |
| `bio` | string | opcional; máximo 240 caracteres |
| `avatarUrl` | string | opcional; URL válida ou `""` (limpa o campo) |
| `githubUrl` | string | opcional; URL válida ou `""` (limpa o campo) |

```json
// Requisição
{ "name": "Hayverson", "bio": "Game dev", "avatarUrl": "", "githubUrl": "https://github.com/hayverson" }
// 200
{ "user": { "id": "user-1", "name": "Hayverson", "email": "hayverson@patchnotes.dev", "bio": "Game dev", "avatarUrl": "", "githubUrl": "https://github.com/hayverson" } }
```

Efeito colateral: `name` e `avatarUrl` refletem em `GET /auth/me`. Erros: `400` · `401` · `500`.

---

## Cenários simulados (somente MSW, desenvolvimento)

Para exercitar estados de erro e vazio sem editar código, o frontend envia o cabeçalho `X-Mock-Scenario` quando um cenário está ativo. **Ele não faz parte do contrato**: o backend real deve ignorá-lo.

Ative pela URL, abrindo qualquer página com o parâmetro `mock`:

| Exemplo | Efeito |
|---|---|
| `/dashboard?mock=server-error` | todos os domínios respondem 500 |
| `/dashboard?mock=dashboard:empty` | só o domínio dashboard responde vazio |
| `/chat?mock=chat:server-error,devlog:empty` | vários domínios ao mesmo tempo |
| `/profile?mock=profile:invalid-payload` | `PATCH /profile` responde 400 |
| `/dashboard?mock=dashboard:unauthorized` | 401 → sessão encerrada → `/login` |

Domínios: `auth`, `dashboard`, `devlog`, `chat`, `profile` (ou sem prefixo = todos). O cenário do domínio prevalece sobre o global.

| Cenário | Consultas (GET) | Mutações (POST/PATCH) |
|---|---|---|
| `success` (padrão) | dados normais | comportamento normal |
| `empty` | listas vazias, métricas zeradas, perfil só com campos obrigatórios | comportamento normal |
| `invalid-payload` | comportamento normal | 400 com `details` |
| `unauthorized` | 401 | 401 |
| `server-error` | 500 | 500 |

Enquanto um cenário está ativo, um aviso "MSW: …" aparece no topo da tela com o botão **Limpar**. O cenário vale para a navegação dentro do app e é descartado ao recarregar a página sem o parâmetro.

### Dados de teste

- Usuário pré-cadastrado: `hayverson@patchnotes.dev` / `patchnotes123`.
- O estado do mock (usuários cadastrados, entradas, mensagens, perfil) vive **na memória da aba** e é reiniciado a cada recarregamento completo. Um usuário criado no cadastro deixa de existir após recarregar a página; o cookie restante gera 401 e o app volta ao login.

---

## Parte 2 — backend real (adições aprovadas)

O backend FastAPI (`backend/`) implementa **todos os endpoints acima com os mesmos formatos**. As adições abaixo foram aprovadas e **não alteram** nenhum contrato existente; o frontend da Parte 1 funciona sem usá-las. Instruções de execução em `backend/README.md`.

### Diferenças de comportamento em relação ao MSW

- `token` passa a ser um JWT (o frontend continua tratando-o como opaco). Validade curta (15 min, `ACCESS_TOKEN_TTL_MINUTES`); o frontend renova a sessão sozinho via `POST /auth/refresh` (ver “Uso pelo frontend” abaixo).
- Login e cadastro também definem o cookie `patchnotes_refresh` (httpOnly, SameSite=Strict, path `/api/auth`). O corpo da resposta não muda.
- Limites de validação do servidor além dos da Parte 1, para proteção: `name` ≤ 100, `password` ≤ 128, devlog `title` ≤ 200, `content` ≤ 20.000, até 20 `tags` de ≤ 40 caracteres (duplicadas e espaços extras são removidos), URLs de perfil ≤ 2.048 e **somente http(s)**, `context` do chat ≤ 4.000.
- Mensagens de chat do usuário também trazem `tokensUsed` (tokens do prompt). O campo já era opcional em `ChatMessage`.
- `/dashboard/metrics.tokensUsed` e `/dashboard/token-usage` somam os tokens de prompt e de resposta. O histórico do chat devolve as 200 mensagens mais recentes.

### `POST /auth/refresh`

Usa o cookie `patchnotes_refresh`; não tem corpo. Rotaciona o refresh token (o cookie é substituído) e devolve uma sessão nova no mesmo formato de login: `200 { user, token }`.

Erros: `401` (sem cookie, expirado, revogado; reapresentar um token já usado revoga a família inteira de sessões), `403` (`Origin` não autorizado), `429`.

### `POST /auth/logout`

Revoga a sessão do cookie `patchnotes_refresh` e apaga o cookie. Responde `204` mesmo sem cookie. Erro: `403` (`Origin` não autorizado).

### `POST /auth/forgot-password`

| Campo | Tipo | Regras |
|---|---|---|
| `email` | string | e-mail válido |

```json
// 202 — sempre a mesma resposta, exista ou não a conta
{ "message": "Se o e-mail estiver cadastrado, você receberá as instruções para redefinir a senha." }
```

Envia um e-mail com o link `<FRONTEND_URL>/reset-password#token=<token>`. O token vai no fragmento, que não é enviado a servidores. É de uso único e vale 30 minutos; um pedido novo invalida os anteriores. Erros: `400`, `429`.

### `POST /auth/reset-password`

| Campo | Tipo | Regras |
|---|---|---|
| `token` | string | token recebido por e-mail |
| `password` | string | 8 a 128 caracteres |

Responde `204` e encerra todas as sessões existentes (refresh tokens revogados e access tokens anteriores recusados). Erros: `400` `{ "message": "Link de redefinição inválido ou expirado. Solicite um novo." }`, `429`.

### Uso pelo frontend (sessão e recuperação de senha)

- **Renovação:** em um `401` de rota protegida, o interceptor do Axios (`src/lib/axios.ts`) chama `POST /auth/refresh` uma única vez (chamadas simultâneas compartilham a mesma renovação), grava o novo `token` e refaz a requisição. Se o refresh falhar, encerra a sessão como antes (→ `/login`, "Sua sessão expirou"). Rotas de autenticação (`login`, `register`, `refresh`, `logout`, `forgot-password`, `reset-password`) não disparam renovação.
- **WebSocket:** se a conexão for recusada com `4401`, o chat renova o token e reenvia a mensagem uma vez (o servidor recusa antes de processar, então não há duplicação).
- **Sair:** chama `POST /auth/logout` em segundo plano e apaga a sessão local na hora.
- **Telas:** `/forgot-password` (link "Esqueci minha senha" no login) e `/reset-password`, que lê o token do fragmento `#token=…`.
- O cookie `patchnotes_token` dura 7 dias (validade do refresh token), para o middleware do Next não mandar ao login enquanto a sessão ainda pode ser renovada.
- **No MSW:** `/auth/refresh` sempre responde `401` (o mock não mantém refresh tokens), `/auth/logout` responde `204`, `/auth/forgot-password` responde `202` e `/auth/reset-password` aceita apenas o token `token-de-redefinicao-do-mock-0001` (abra `/reset-password#token=token-de-redefinicao-do-mock-0001`).

### `GET /dashboard/token-balance` 🔒

Saldo da cota mensal de tokens (UTC; limite configurável, padrão 100.000).

```json
{ "balance": 99984, "limit": 100000, "used": 16, "periodStart": "2026-11-01T00:00:00.000Z", "periodEnd": "2026-12-01T00:00:00.000Z" }
```

Com `balance` 0, `POST /chat/send` responde `429` e o WebSocket envia `error` com `code: "quota_exceeded"`. Erros: `401`.

### WebSocket `/ws/chat`

Fica fora do prefixo `/api`; em desenvolvimento, `ws://127.0.0.1:8000/ws/chat`. Usa frames de texto JSON. O `Origin` precisa estar em `CORS_ORIGINS` (caso contrário, a conexão é recusada com 403). **O token nunca vai na URL.**

| Direção | Evento | Quando |
|---|---|---|
| cliente → servidor | `{"type":"auth","token":"<access token>"}` | primeira mensagem, em até 5 s |
| servidor → cliente | `{"type":"ready"}` | autenticado |
| cliente → servidor | `{"type":"message","message":"...","context":"..."?}` | `message` com 1 a 2.000 caracteres |
| servidor → cliente | `{"type":"start"}` | geração iniciada (pedido gravado) |
| servidor → cliente | `{"type":"token","content":"..."}` | cada trecho gerado pelo LLM |
| servidor → cliente | `{"type":"done","done":true,"tokens":43,"message":ChatMessage}` | fim da resposta; `message` é a mensagem do assistente persistida |
| servidor → cliente | `{"type":"error","code":"...","message":"..."}` | erro recuperável; a conexão continua aberta |

Códigos de `error`: `invalid_message`, `rate_limited`, `quota_exceeded`, `llm_unavailable`, `llm_timeout`, `llm_error`, `unavailable` (armazenamento dos limites fora do ar), `unauthorized` e `too_many_connections` (ambos seguidos de fechamento).

Códigos de fechamento: `4401` (sem autenticação, prazo esgotado, token inválido, revogado ou **expirado durante a conexão**), `4408` (inatividade: 10 min sem mensagens), `4429` (mais de 3 conexões simultâneas da mesma conta), `1008` (frame binário), `1009` (frame acima de 16 KB), `1011` (erro interno), `1013` (serviço indisponível). Handshake recusado (HTTP 403): `Origin` não autorizado ou mais de 20 conexões simultâneas do mesmo IP. O frontend reconecta sozinho no próximo envio depois de qualquer fechamento.

**Uso pelo frontend:** com `NEXT_PUBLIC_CHAT_WS_URL` definido e o MSW desligado, a tela do chat usa este WebSocket (`src/modules/chat/services/chat-socket.ts`). Ela abre a conexão no primeiro envio e a reaproveita, e fecha quando a pessoa sai da tela. Sem a variável, ou com o MSW, continua usando `POST /chat/send`.

Uma resposta por vez em cada conexão. Se o cliente desconectar no meio, a geração é interrompida e o pedido não entra no histórico. Mensagens concluídas aparecem também em `GET /chat/history`.
