# Contratos da API — Patchnotes

Este documento é a **fonte única** dos contratos HTTP entre o frontend e a API. Os contratos nasceram na Parte 1 (com a API simulada pelo MSW, já removido) e o backend FastAPI da Parte 2 os implementa sem mudanças de formato.

Referências de implementação (devem permanecer alinhadas a este documento):

| Camada | Arquivos |
|---|---|
| Tipos | `src/modules/*/types/*.types.ts`, `src/shared/types/api.types.ts` |
| Serviços (Axios) | `src/modules/*/services/*.service.ts`, cliente em `src/lib/axios.ts` |
| Implementação | `backend/app/routers/*.py`, `backend/app/schemas/*.py` |
| Testes de contrato | `backend/tests/*.py` (`python -m pytest`) |
| Documentação interativa | Swagger em `http://localhost:8000/docs` |

> Mudanças de contrato devem ser feitas **primeiro aqui**, depois nos tipos, no backend e nos testes. Não altere um contrato para acomodar uma tela sem registrar a mudança neste arquivo.

## Convenções gerais

- **Base URL:** `/api` (o Axios usa `baseURL: "/api"`; os caminhos abaixo são relativos a ela).
- **Formato:** JSON (`Content-Type: application/json`) em requisições e respostas. Datas em ISO 8601 (`2026-09-17T18:30:00.000Z`); datas sem hora em `YYYY-MM-DD`.
- **Campos opcionais** podem ser omitidos da resposta (não são enviados como `null`).
- **Autenticação:** endpoints marcados com 🔒 exigem o access token (JWT), de um destes jeitos:
  - **Navegador:** cookie `patchnotes_access` (HttpOnly, SameSite=Strict, `Secure` em HTTPS), gravado pela API em `login`, `verify-email` e `refresh`. O token **não vem no corpo** e o JavaScript não consegue lê-lo. Escritas (POST/PATCH/PUT/DELETE) autenticadas pelo cookie precisam vir do próprio site (`Origin` em `CORS_ORIGINS` ou igual ao da API, e `Sec-Fetch-Site` diferente de `cross-site`); caso contrário, `403`.
  - **Swagger e scripts:** header `Authorization: Bearer <token>` (o valor do cookie).
  - O middleware do Next protege as rotas pela presença do cookie `patchnotes_access`; o frontend guarda só um indicador sem segredo (`patchnotes_session=1`).
- **401 em endpoint protegido:** o interceptor do Axios tenta renovar a sessão com `POST /auth/refresh`; se não conseguir, chama `POST /auth/logout` (a API apaga os cookies HttpOnly) e o app vai para `/login`, que avisa "Sua sessão expirou".

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
| 403 | *(Parte 2)* Requisição de outro site: rotas de autenticação e escritas autenticadas pelo cookie (ver Autenticação) | Mensagem do servidor |
| 413 | *(Parte 2)* Corpo da requisição maior que 64 KB (256 KB no upload do avatar) | Mensagem do servidor |
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
{ "user": { "id": "user-1", "name": "Hayverson", "email": "hayverson@patchnotes.dev" } }
// Set-Cookie: patchnotes_access=<JWT>; HttpOnly; SameSite=Strict; Path=/
// Set-Cookie: patchnotes_refresh=<opaco>; HttpOnly; SameSite=Strict; Path=/api/auth
```

Erros: `400` payload inválido · `401` `{ "message": "E-mail ou senha inválidos" }` · `403` origem de outro site · `500`.

### `POST /auth/register`

Pede o cadastro. **Não cria a conta nem abre sessão:** envia um link de confirmação para o e-mail. A resposta é sempre a mesma, exista ou não uma conta com o e-mail (o cadastro não revela quais endereços estão cadastrados). Se o e-mail já tem conta, a dona recebe um aviso em vez do link. A confirmação de senha é validada **apenas no cliente** e não é enviada.

| Campo | Tipo | Regras |
|---|---|---|
| `name` | string | 2 a 100 caracteres |
| `email` | string | e-mail válido |
| `password` | string | 8 a 128 caracteres |

```json
// Requisição
{ "name": "Ada", "email": "ada@patchnotes.dev", "password": "senha-segura" }
// 202 — sempre igual
{ "message": "Enviamos um link de confirmação para o e-mail informado. Abra-o para ativar a conta." }
```

O link é `<FRONTEND_URL>/verify-email#token=<token>` (token no fragmento, que não vai a servidores nem a logs), de uso único, válido por 24 h (`EMAIL_VERIFICATION_TTL_MINUTES`). Um pedido novo para o mesmo e-mail substitui o anterior. A senha fica guardada (hash Argon2) no pedido pendente: quem cadastra o e-mail de outra pessoa não cria conta com a própria senha.

Erros: `400` · `403` origem de outro site · `429` (10/h por IP; 3 por 15 min por e-mail e IP; 10/h por e-mail) · `500`.

### `POST /auth/verify-email`

Confirma o cadastro: cria a conta e abre a sessão (mesmos cookies e corpo do login).

```json
// Requisição
{ "token": "<token do link>" }
// 200
{ "user": { "id": "3f2c…", "name": "Ada", "email": "ada@patchnotes.dev" } }
```

Erros: `400` `{ "message": "Link de confirmação inválido ou expirado. Faça o cadastro de novo." }` · `403` · `429` (10 por 15 min por IP).

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
| `githubUrl` | string | opcional; URL válida ou `""` (limpa o campo) |

```json
// Requisição
{ "name": "Hayverson", "bio": "Game dev", "githubUrl": "https://github.com/hayverson" }
// 200
{ "user": { "id": "user-1", "name": "Hayverson", "email": "hayverson@patchnotes.dev", "bio": "Game dev", "avatarUrl": "/api/profile/avatar?v=3f9a1c2b7d10", "githubUrl": "https://github.com/hayverson" } }
```

`avatarUrl` é **só de leitura** (enviado aqui, é ignorado): a foto vai por `PUT /profile/avatar`. Efeito colateral: `name` reflete em `GET /auth/me`. Erros: `400` · `401` · `403` · `500`.

### `PUT /profile/avatar` 🔒

Envia a foto de perfil. O corpo são os **bytes da imagem** (não JSON). O tipo é decidido pela assinatura do arquivo, não pelo `Content-Type`: só PNG, JPEG e WebP, até 256 KB (`AVATAR_MAX_BYTES`). SVG e HTML disfarçados são recusados. Responde `200` com o perfil; `avatarUrl` passa a `/api/profile/avatar?v=<versão>` (muda a cada envio).

Erros: `400` `{ "message": "Envie uma imagem PNG, JPEG ou WebP." }` · `401` · `403` · `413` · `429`.

### `DELETE /profile/avatar` 🔒

Remove a foto. `200` com o perfil sem `avatarUrl`.

### `GET /profile/avatar` 🔒

A foto de quem está logado (`image/png`, `image/jpeg` ou `image/webp`, `Cache-Control: private`). `404` sem foto. Só a própria pessoa vê a própria foto.

---

## Dados de teste

- `python -m app.scripts.seed` (no `backend/`) cria a conta `dev@patchnotes.dev` / `patchnotes123` com algumas entradas de devlog. Recusa rodar com `ENVIRONMENT=production`.

---

## Parte 2 — backend real (adições aprovadas)

O backend FastAPI (`backend/`) implementa **todos os endpoints acima com os mesmos formatos**. As adições abaixo foram aprovadas e **não alteram** nenhum contrato existente. Instruções de execução em `backend/README.md`.

### Diferenças de comportamento em relação à Parte 1

- `token` passa a ser um JWT (o frontend continua tratando-o como opaco). Validade curta (15 min, `ACCESS_TOKEN_TTL_MINUTES`); o frontend renova a sessão sozinho via `POST /auth/refresh` (ver “Uso pelo frontend” abaixo).
- Login, confirmação de cadastro e refresh definem os cookies `patchnotes_access` e `patchnotes_refresh` (HttpOnly, SameSite=Strict). Desde 18/11/2026 o corpo traz só `{ user }` (antes trazia também `token`), e o cadastro passou a exigir confirmação por e-mail.
- Limites de validação do servidor além dos da Parte 1, para proteção: `name` ≤ 100, `password` ≤ 128, devlog `title` ≤ 200, `content` ≤ 20.000, até 20 `tags` de ≤ 40 caracteres (duplicadas e espaços extras são removidos), `githubUrl` ≤ 2.048 e **somente http(s)**, `context` do chat ≤ 4.000.
- Mensagens de chat do usuário também trazem `tokensUsed` (tokens do prompt). O campo já era opcional em `ChatMessage`.
- `/dashboard/metrics.tokensUsed` e `/dashboard/token-usage` somam os tokens de prompt e de resposta. O histórico do chat devolve as 200 mensagens mais recentes.

### `POST /auth/refresh`

Usa o cookie `patchnotes_refresh`; não tem corpo. Rotaciona o refresh token e regrava os dois cookies; corpo no mesmo formato do login: `200 { user }`.

Erros: `401` (sem cookie, expirado, revogado; reapresentar um token já usado revoga a família inteira de sessões), `403` (outro site), `429`.

### `POST /auth/logout`

Revoga a sessão do cookie `patchnotes_refresh` e apaga os dois cookies. Responde `204` mesmo sem cookie. Erro: `403` (outro site).

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

- **Renovação:** em um `401` de rota protegida, o interceptor do Axios (`src/lib/axios.ts`) chama `POST /auth/refresh` uma única vez (chamadas simultâneas compartilham a mesma renovação); a API regrava os cookies e a requisição é refeita. Se o refresh falhar, encerra a sessão como antes (→ `/login`, "Sua sessão expirou"). Rotas de autenticação (`login`, `register`, `verify-email`, `refresh`, `logout`, `forgot-password`, `reset-password`) não disparam renovação.
- **WebSocket:** autentica com `{"type":"auth"}` e o cookie do handshake. Se a conexão for recusada com `4401`, o chat renova a sessão, reconecta e reenvia a mensagem uma vez (o servidor recusa antes de processar, então não há duplicação).
- **Sair:** apaga o indicador local, espera `POST /auth/logout` apagar os cookies e recarrega a página em `/login` (descarta da memória os dados da conta).
- **Telas:** `/forgot-password` (link "Esqueci minha senha" no login), `/reset-password` e `/verify-email`, que leem o token do fragmento `#token=…` e o apagam da barra de endereço.
- Os cookies duram 7 dias (validade do refresh token), para o middleware do Next não mandar ao login enquanto a sessão ainda pode ser renovada; o JWT dentro do `patchnotes_access` vence em 15 min.

### `GET /dashboard/token-balance` 🔒

Saldo da cota mensal de tokens (UTC; limite configurável, padrão 100.000).

```json
{ "balance": 99984, "limit": 100000, "used": 16, "credits": 0, "periodStart": "2026-11-01T00:00:00.000Z", "periodEnd": "2026-12-01T00:00:00.000Z" }
```

`limit` = cota mensal + `credits` (recargas do mês). Com `balance` 0, `POST /chat/send` responde `429` e o WebSocket envia `error` com `code: "quota_exceeded"`. Erros: `401`.

### `GET /tokens/balance` 🔒

Mesmo corpo de `GET /dashboard/token-balance`. Usado pela tela `/tokens`.

### `GET /tokens/history?limit=20` 🔒

Extrato do mais recente para o mais antigo, misturando consumo (uma linha por resposta do modelo) e recargas. `limit` de 1 a 50 (padrão 20). `packages` lista os valores aceitos em `POST /tokens/recharge`.

```json
{
  "items": [
    { "id": "…", "kind": "recharge", "amount": 50000, "createdAt": "2026-11-18T14:02:00.000Z", "estimated": false },
    { "id": "…", "kind": "usage", "amount": 16, "createdAt": "2026-11-18T14:00:00.000Z", "model": "qwen2.5:3b", "promptTokens": 12, "completionTokens": 4, "estimated": false }
  ],
  "packages": [10000, 50000, 100000]
}
```

Erros: `400` (`limit` fora do intervalo) · `401`.

### `POST /tokens/recharge` 🔒

Recarga **simulada** (não há cobrança). Soma um pacote ao saldo do mês corrente.

Requisição: `{ "amount": 50000 }` — `amount` precisa ser um dos `packages`.

Resposta `200`: o corpo de `GET /tokens/balance` com `"recharged": 50000`.

Erros: `400` (pacote inválido, `details.amount`) · `401` · `429` (teto mensal de recargas, `MONTHLY_TOKEN_CREDIT_CAP`, ou mais de 10 recargas por minuto).

### `GET /health`

Público. `{ "status": "ok" }`. Usado pelo healthcheck do Docker.

### WebSocket `/ws/chat`

Fica fora do prefixo `/api`; em desenvolvimento, `ws://127.0.0.1:8000/ws/chat`. Usa frames de texto JSON. O `Origin` precisa estar em `CORS_ORIGINS` (caso contrário, a conexão é recusada com 403). **O token nunca vai na URL.**

| Direção | Evento | Quando |
|---|---|---|
| cliente → servidor | `{"type":"auth"}` (navegador: usa o cookie `patchnotes_access` do handshake) ou `{"type":"auth","token":"<access token>"}` | primeira mensagem, em até 5 s |
| servidor → cliente | `{"type":"ready"}` | autenticado |
| cliente → servidor | `{"type":"message","message":"...","context":"..."?}` | `message` com 1 a 2.000 caracteres |
| servidor → cliente | `{"type":"start"}` | geração iniciada (pedido gravado) |
| servidor → cliente | `{"type":"token","content":"..."}` | cada trecho gerado pelo LLM |
| servidor → cliente | `{"type":"done","done":true,"tokens":43,"message":ChatMessage}` | fim da resposta; `message` é a mensagem do assistente persistida |
| servidor → cliente | `{"type":"error","code":"...","message":"..."}` | erro recuperável; a conexão continua aberta |

Códigos de `error`: `invalid_message`, `rate_limited`, `quota_exceeded`, `llm_unavailable`, `llm_timeout`, `llm_error`, `unavailable` (armazenamento dos limites fora do ar), `unauthorized` e `too_many_connections` (ambos seguidos de fechamento).

Códigos de fechamento: `4401` (sem autenticação, prazo esgotado, token inválido, revogado ou **expirado durante a conexão**), `4408` (inatividade: 10 min sem mensagens), `4429` (mais de 3 conexões simultâneas da mesma conta), `1008` (frame binário), `1009` (frame acima de 16 KB), `1011` (erro interno), `1013` (serviço indisponível). Handshake recusado (HTTP 403): `Origin` não autorizado ou mais de 20 conexões simultâneas do mesmo IP. Depois de um `4408`, o frontend reabre a conexão no próximo envio; nos demais fechamentos, mostra um aviso e reconecta sozinho.

**Uso pelo frontend:** o chat envia mensagens **somente** por este WebSocket (`src/modules/chat/services/chat-socket.ts`, endereço em `NEXT_PUBLIC_CHAT_WS_URL`, padrão `ws://localhost:8000/ws/chat`). A conexão abre quando a tela monta e fecha quando a pessoa sai dela. Se cair, a tela mostra um aviso e tenta reconectar com espera crescente (1 s, 2 s, 4 s… até 15 s), com um botão para reconectar na hora; o formulário fica bloqueado sem conexão e enquanto o modelo responde. `POST /chat/send` continua disponível no backend para clientes sem WebSocket, mas o frontend não o usa.

Uma resposta por vez em cada conexão. Se o cliente desconectar no meio, a geração é interrompida e o pedido não entra no histórico. Mensagens concluídas aparecem também em `GET /chat/history`.
