# Revisão de arquitetura e segurança — Patchnotes

Data: 12/11/2026 · Branch: `implementando-backend` (HEAD `737728a`, working tree limpo no início da revisão) · Escopo: revisão estática do código atual, com verificações automatizadas locais. Nenhum arquivo de código foi alterado.

**Skills usadas:** não há skill chamada "System Design" no ambiente. Para arquitetura usei a mais próxima, `backend-patterns` (camadas, repositórios, transações, rate limiting, logs); para segurança, `security-review` (segredos, validação, injeção, autenticação, XSS, CSRF, rate limiting, exposição de dados, dependências).

**Convenção de classificação dos achados:** **comprovado** = reproduzido ou evidente no código; **potencial** = depende de configuração ou implantação; **não verificável** = exige serviço, credencial ou consulta externa não feita.

---

## 1. Resumo executivo

O projeto está em bom estado. O backend FastAPI implementa todos os endpoints da Parte 1 com os mesmos formatos, e também as adições da Parte 2: refresh com rotação, logout, recuperação de senha, saldo de tokens e WebSocket `/ws/chat` com streaming. A arquitetura em camadas (routers → services → repositories) é respeitada. Os testes passam: 86 no backend e 45 de contrato no frontend.

As bases de segurança estão bem feitas:
- **Senhas:** Argon2id.
- **Tokens:** refresh e redefinição de senha são opacos de 256 bits, guardados como SHA-256. O token de redefinição é de uso único, garantido por `UPDATE` condicional.
- **Logs e erros:** SQL com `hide_parameters`, mensagens de erro genéricas e nenhum token em URL.
- **Banco:** nenhuma transação fica aberta durante a geração do LLM.

Riscos mais importantes:

1. **Alta, comprovada:** `PATCH /profile` usa `session.merge` com o objeto `User` carregado na autenticação. Uma redefinição de senha concluída entre a autenticação e o merge é **desfeita**: o hash antigo volta e `tokens_valid_after` é zerado. Reproduzi isso no banco de testes. Isso anula a recuperação de conta justamente quando um atacante tem um access token roubado e repete PATCHs.
2. **Média, potencial:** atrás do rewrite do Next, todos os clientes chegam ao FastAPI com o mesmo IP (`127.0.0.1`), e os limites por IP viram **globais**. Login de 20/min e cadastro de 10/h passam a valer para todos os usuários juntos. Com `TRUST_PROXY_HEADERS=true`, o IP sai do primeiro valor de `X-Forwarded-For`, que o cliente controla, e os limites podem ser contornados.
3. **Média, potencial:** o WebSocket não limita conexões simultâneas (nem autenticadas nem pendentes de autenticação) e não tem timeout de inatividade após o `ready`.
4. **Baixa:** o access token fica em cookie legível por JavaScript (`patchnotes_token`, sem `HttpOnly` nem `Secure`) e não há cabeçalhos de segurança (CSP etc.) no Next. Em caso de XSS, o token vaza; o impacto é limitado pela validade de 15 min.

Nenhum segredo real está versionado.

---

## 2. Arquitetura encontrada

```text
Navegador (Next.js 14, App Router)
 ├─ middleware.ts ─ protege /dashboard /chat /devlog /profile pela PRESENÇA do cookie patchnotes_token
 ├─ src/lib/axios.ts ─ baseURL /api, Bearer do authStore; 401 → POST /auth/refresh (1x) → repete
 ├─ src/modules/{auth,dashboard,devlog,chat,profile}/ ─ types · services · hooks · schemas · components
 ├─ src/mocks/handlers.ts ─ MSW (dev, padrão) com cenários ?mock=
 └─ chat-socket.ts ─ WebSocket direto em NEXT_PUBLIC_CHAT_WS_URL (fora do rewrite)
        │ /api/* (rewrite do Next quando API_URL definido; mesmo origin)
        ▼
FastAPI (backend/app)
 ├─ main.py ─ fábrica: BodySizeLimit (64 KB) → CORS → handlers de erro → routers
 ├─ routers/ auth · profile · devlog · chat · dashboard (/api) · ws_chat (/ws/chat)
 ├─ services/ auth · profile · devlog · chat · llm (Ollama) · dashboard · quota · email (SMTP)
 ├─ repositories/ users · tokens · devlog · chat · metrics (SQLAlchemy; 1 SQL textual parametrizado)
 ├─ core/ config (pydantic-settings) · security (Argon2/JWT) · errors · rate_limit (memória) · middleware
 └─ migrations/ Alembic (0001)
        │ asyncpg                         │ httpx (stream NDJSON)      │ SMTP
        ▼                                 ▼                            ▼
PostgreSQL 17 (docker, 127.0.0.1)   Ollama (127.0.0.1:11434)    Mailpit (dev, 127.0.0.1)
```

**Fluxos principais**

- **Autenticação.** Login e cadastro devolvem `{user, token}` (JWT HS256 de 15 min) e gravam o cookie `patchnotes_refresh`: httpOnly, `SameSite=Strict`, path `/api/auth`. No banco fica só o SHA-256 (`routers/auth.py:27-32`, `core/security.py:50-88`). `get_current_user` valida o JWT e consulta o usuário numa sessão curta própria (`routers/deps.py:30-36`). Tokens emitidos antes de uma redefinição são recusados por `tokens_valid_after` (`services/auth_service.py:121`).
- **Refresh.** Cada uso revoga o token atual (`UPDATE … WHERE revoked_at IS NULL AND expires_at > now`) e emite outro na mesma família. Reapresentar um token já revogado revoga a família inteira, e essa revogação é gravada antes do 401 (`routers/auth.py:73-86`, `repositories/tokens.py:23-41`).
- **Recuperação de senha.**
  - `forgot-password` sempre responde 202. O e-mail sai em background, com o link `…/reset-password#token=…` (o token vai no fragmento).
  - `reset-password` consome o token com um `UPDATE` condicional, troca o hash, define `tokens_valid_after` e revoga todos os refresh tokens (`services/auth_service.py:126-148`).
- **Chat** (`services/chat_service.py`):
  - **Transação curta 1:** confere a cota, grava a mensagem do usuário como `pending` e lê o contexto.
  - **Streaming sem banco:** o Ollama gera a resposta (`aclosing` fecha a conexão se o cliente cair).
  - **Transação curta 2:** marca o pedido como `complete`, grava a resposta e o uso de tokens. Em erro, uma transação curta marca o pedido como `failed`.
  - REST (`POST /api/chat/send`) e WebSocket compartilham o mesmo serviço.
- **WebSocket.** O servidor confere a `Origin` (quando presente) e aceita a conexão. A primeira mensagem `{"type":"auth","token"}` deve chegar em até 5 s. O token é revalidado a cada mensagem. Frames são limitados a 16 KB, e erros recuperáveis viram eventos `error` (`routers/ws_chat.py`).
- **Métricas.** Todas as consultas filtram por `user_id`. O SQL textual de `activeTime` usa o parâmetro `:user_id` (`repositories/metrics.py:13-34`).

**Avaliação da arquitetura (backend-patterns):** as camadas estão bem separadas, sem lógica em `main.py` e com injeção de serviços via `app.state`. A sessão por requisição tem commit antes da resposta (`Depends(..., scope="function")`). Há índices `(user_id, created_at)` nas tabelas de série temporal e o pool tem `pre_ping`. Pontos fracos:
- rate limit em memória por processo (a própria skill desaconselha em produção);
- listas sem paginação: `GET /devlog/entries` devolve tudo, e o histórico do chat é limitado a 200;
- não há limpeza de tokens expirados nem de mensagens `pending` órfãs (processo morto no meio da geração);
- não há logs estruturados nem request-id.

---

## 3. Matriz de requisitos

| Requisito | Estado | Evidência | Impacto / observação |
|---|---|---|---|
| FastAPI assíncrono, rotas `async def` para I/O | implementado | `routers/*.py`; os `def` síncronos são só helpers sem I/O (`deps.py`, `auth.py:27-46`) | — |
| Sem `asyncio.run()` em rotas | implementado | único uso em `scripts/seed.py:45` (CLI) | — |
| Routers / services / repositories | implementado | estrutura de `backend/app/` | — |
| PostgreSQL + migrations versionadas | implementado | `migrations/versions/0001_esquema_inicial.py`; `alembic check` sem diferenças | Só há uma migration; está em dia com os modelos |
| Cadastro com Pydantic | implementado | `schemas/auth.py:21-26` (e-mail normalizado em minúsculas, limites) | 409 revela e-mail cadastrado (exigido pelo contrato) |
| Login JWT + refresh | implementado | `services/auth_service.py:66-96` | — |
| Rotação/revogação de refresh | implementado | `repositories/tokens.py:23-47` | — |
| Recuperação de senha (token aleatório, uso único, expira, hash) | implementado, com falha | `auth_service.py:126-148`, `tokens.py:50-71` | **Pode ser desfeita** por um PATCH de perfil concorrente (achado S1) |
| Atualização de perfil | implementado, com falha | `routers/profile.py:15-19` | Achado S1 (lost update) |
| Autorização / isolamento entre usuários | implementado | todas as consultas filtram `user_id`; teste de autorização entre usuários em `tests/` | Não encontrei IDOR: nenhuma rota recebe ID de recurso |
| Senhas com hash e sal | implementado | `core/security.py:18-36` (Argon2id; rehash no login) | — |
| Sem segredos/tokens nos logs | implementado | logs só registram tipo de erro e rota (`errors.py:76`, `ws_chat.py:96,153`); `hide_parameters=True` (`db/session.py`) | Busca no log real da API (sessão anterior) sem JWT nem senha |
| WebSocket `/ws/chat` com streaming | implementado | `routers/ws_chat.py`; testes em `tests/test_ws_chat.py` | Sem limite de conexões (achado S3) |
| Autenticação no WebSocket sem token na URL | implementado | 1ª mensagem `auth` (`ws_chat.py:105-117`) | — |
| Persistir mensagens e tokens | implementado | `chat_service.py` + tabela `token_usage` | Tokens do Ollama; estimativa marcada `estimated` |
| Desconexão, mensagens inválidas ou grandes, falhas e timeout do LLM | implementado | `ws_chat.py:47-58,122-155`; `llm_service.py` (connect/read/total) | — |
| Nada de transação/lock durante o LLM | implementado | `chat_service.py:55-63`; README cita teste do pool em 0 | Não encontrei `FOR UPDATE` |
| Ollama configurável por env | implementado | `config.py` (`OLLAMA_*`) | — |
| Métricas do dashboard | implementado | `routers/dashboard.py`, `repositories/metrics.py` | — |
| Histórico de consumo de tokens | implementado | `GET /dashboard/token-usage` (contrato da Parte 1) | — |
| Saldo atual de tokens | implementado | `GET /dashboard/token-balance` (adição aprovada) | Cota pode passar em uma resposta com pedidos simultâneos (documentado) |
| CORS restrito | implementado | `main.py` (lista explícita); `config.py` recusa `*` | — |
| MSW preservado para desenvolvimento | implementado | `src/mocks/handlers.ts`; 45 testes | — |
| Frontend sem persistência local | implementado | nada de `localStorage`; o token fica em cookie (achado S5) | — |
| Rate limiting | parcial | `core/rate_limit.py` | Em memória e por processo; IP incorreto atrás do proxy (achado S2) |
| Execução real com Ollama | não verificável nesta revisão | serviço `ollama` estava **inativo** durante a revisão | Validado na sessão anterior (GPU, ponta a ponta) |

---

## 4. Achados de segurança

### S1 — Alta (comprovado): perfil sobrescreve senha e `tokens_valid_after` (lost update)

- **Evidência:** `backend/app/routers/profile.py:15-19`:
  - `get_current_user` carrega o `User` numa sessão que é fechada logo em seguida (`routers/deps.py:30-36`);
  - `update_profile` faz `session.merge(user)`, que **copia todos os atributos carregados** do objeto antigo, incluindo `password_hash` e `tokens_valid_after`, e os grava no flush.
- **Reprodução** (feita nesta revisão, no banco `patchnotes_test`, com um usuário descartável apagado em seguida): autenticação → redefinição grava `HASH_NOVO` → merge + update de `bio`. Resultado final: `password_hash = HASH_ANTIGO` e `tokens_valid_after = None`.
- **Cenário de risco:** a vítima redefine a senha porque a conta foi comprometida. O atacante, com um access token ainda válido (até 15 min) ou que conheça a senha antiga, dispara `PATCH /profile` em laço (essa rota não tem rate limit). Basta um PATCH cruzar a janela para que **a senha antiga volte a valer e os access tokens antigos voltem a ser aceitos**. Também acontece sem atacante: editar o perfil em outra aba no mesmo instante desfaz a redefinição em silêncio.
- **Recomendação:** não usar `merge` com um objeto vindo de outra sessão. Fazer `UPDATE users SET <campos do perfil> WHERE id = :id` só com as colunas enviadas (como em `set_password`), ou recarregar o usuário na sessão da requisição (`session.get(User, user.id)`) e alterar só os campos do perfil. Adicionar um teste de regressão com essa sequência. Considerar rate limit em `PATCH /profile`.

### S2 — Média (potencial; depende da implantação): IP do cliente errado atrás do rewrite do Next

- **Evidência:**
  - `next.config.mjs:7-9`: o rewrite `/api/*` passa pelo proxy do Next, que não define `X-Forwarded-For` (`node_modules/next/dist/server/lib/router-utils/proxy-request.js`: só `x-forwarded-host`). O cabeçalho enviado pelo cliente segue adiante sem alteração;
  - `backend/app/core/rate_limit.py:43-48`: com `TRUST_PROXY_HEADERS=false` (padrão) usa `request.client.host`; com `true` usa o **primeiro** valor de `X-Forwarded-For`.
- **Cenário de risco:**
  - **Padrão:** todos os usuários compartilham o IP do servidor Next. Um único cliente esgota o login (20/min), o cadastro (10/h) ou a recuperação (5/15 min) **para todos**, uma negação de serviço barata.
  - **Com `true`:** o cliente forja `X-Forwarded-For` e contorna os limites por IP, o que favorece força bruta de senha. Os limites por e-mail continuam valendo.
- **Recomendação:** em produção, colocar um proxy reverso confiável (nginx/Caddy) antes de Next e FastAPI, que **sobrescreva** `X-Forwarded-For`. Usar o valor mais à direita adicionado pelo proxy confiável (ou `--proxy-headers --forwarded-allow-ips` do uvicorn) e mover o rate limit para armazenamento compartilhado (Redis). Documentar que o rewrite do Next serve só para desenvolvimento.

### S3 — Média (potencial): WebSocket sem limite de conexões e sem timeout de inatividade

- **Evidência:** `backend/app/routers/ws_chat.py:82-122`:
  - a conexão é aceita antes da autenticação, que tem 5 s de prazo;
  - não há limite de conexões por IP ou por usuário;
  - após o `ready`, `_receive_text` espera indefinidamente.
  
  O rate limit do chat (`ws_chat.py:138`) só conta mensagens.
- **Cenário de risco:** um cliente abre milhares de sockets (sem token, renovando a cada 5 s, ou autenticados e ociosos) e esgota descritores e memória do processo.
- **Recomendação:**
  - limitar conexões simultâneas por usuário (ex.: 3) e por IP antes do `accept`;
  - adicionar timeout de inatividade (ex.: 10 min) e encerrar conexões cujo access token expirou mesmo sem mensagem;
  - em produção, limitar conexões no proxy;
  - garantir `--ws-max-size` no uvicorn (`backend/README.md:61`). Sem ele, o padrão do uvicorn aceita frames muito maiores que os 16 KB checados pela aplicação.

### S4 — Média (potencial): limites de taxa contornáveis pela limpeza do `RateLimiter`

- **Evidência:** `backend/app/core/rate_limit.py:31-37`. Quando passa de 50.000 chaves, `_prune` remove os baldes com base no `window_seconds` **da chamada atual**, que pode ser 60 s. Isso apaga baldes de janelas longas (cadastro 3.600 s, recuperação 900 s) antes do prazo.
- **Cenário de risco:** um atacante gera muitas chaves (por exemplo, `login-email` com e-mails aleatórios) para forçar a limpeza e zerar os próprios limites longos. O limitador também é por processo e zera a cada reinício.
- **Recomendação:** guardar a janela junto com o balde e limpar pela janela de cada um, ou usar Redis com TTL por chave.

### S5 — Baixa: access token em cookie legível por JS e sem cabeçalhos de segurança

- **Evidência:**
  - `src/store/authStore.ts:32`: `patchnotes_token` é gravado via `document.cookie`, sem `HttpOnly`/`Secure`, com `max-age` de 7 dias;
  - `next.config.mjs` não define CSP, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy` nem HSTS.
  
  Não encontrei `dangerouslySetInnerHTML`, `innerHTML` nem `eval` em `src/`. O React escapa o conteúdo, inclusive as respostas do LLM.
- **Cenário de risco:** qualquer XSS futuro (ou extensão maliciosa) lê o access token, válido por até 15 min. O refresh token continua protegido (httpOnly, path `/api/auth`).
- **Recomendação:** adicionar CSP estrita e os demais cabeçalhos em `next.config.mjs` (`headers()`), além de `Secure` no cookie quando servido por HTTPS. A longo prazo, avaliar access token só em memória, o que exigiria mudar o middleware do Next, que depende do cookie, e portanto **requer aprovação**.

### S6 — Baixa: limite de login por e-mail permite bloquear a conta de terceiros

- **Evidência:** `backend/app/routers/auth.py:54`: limite de 10 tentativas / 5 min por e-mail, aplicado antes da verificação.
- **Cenário de risco:** quem conhece o e-mail da vítima mantém o login dela bloqueado continuamente.
- **Recomendação:** contar só **falhas** por e-mail e combinar e-mail com IP, ou usar atraso progressivo em vez de bloqueio total.

### S7 — Baixa: janela de 1 segundo em `tokens_valid_after`

- **Evidência:** `backend/app/services/auth_service.py:121` compara `iat` (segundos inteiros) com `tokens_valid_after` truncado ao segundo.
- **Cenário de risco:** um access token emitido no mesmo segundo da redefinição, mas antes dela, continua válido (por até 15 min).
- **Recomendação:** recusar `iat <= tokens_valid_after` (arredondado para cima) ou incluir uma "versão de sessão" do usuário no JWT.

### S8 — Baixa: sem limites de taxa nem paginação em escrita e leitura de devlog e perfil

- **Evidência:** `routers/devlog.py` e `routers/profile.py` não usam `enforce`/`limit_by_ip`. `GET /devlog/entries` devolve todas as entradas (`repositories/devlog.py:9-13`).
- **Cenário de risco:** uma conta autenticada cria entradas sem limite (até 20 KB cada) e torna a listagem cada vez mais pesada. Também facilita o S1.
- **Recomendação:** rate limit por usuário nas mutações e paginação, o que **mudaria o contrato** de `GET /devlog/entries` e exige aprovação (ver seção 8).

### Informativos

- **I1 — Segredos.** Nenhum segredo real versionado. Só `backend/.env.example` está no git (e nunca houve `.env` no histórico). `backend/.env` tem permissão `600` e é ignorado. Senhas conhecidas existem só para desenvolvimento:
  - fallback do Postgres em `backend/docker-compose.yml:9`;
  - conta fictícia em `backend/app/scripts/seed.py:17`, que se recusa a rodar com `ENVIRONMENT=production`;
  - credenciais descartáveis de CI em `.github/workflows/ci.yml`.

  Recomendação: garantir que produção não use o compose de desenvolvimento.
- **I2 — Ausência de `Origin`.** `_check_origin` (`routers/auth.py:39-43`) e o WebSocket (`ws_chat.py:85-89`) aceitam requisições **sem** `Origin`. Para refresh e logout, isso não é explorável por navegador, porque `SameSite=Strict` impede o envio do cookie em requisições cross-site. No WebSocket, o token é exigido de qualquer forma.
- **I3 — Prompt injection.** O campo `context` (até 4.000 caracteres) é concatenado ao prompt de sistema (`chat_service.py:73-74`). Hoje o impacto se limita à própria conversa do usuário: o LLM não tem ferramentas nem acesso a dados de outros. Se ganhar ferramentas ou RAG, isso vira risco real.
- **I4 — Enumeração de contas.** O cadastro responde 409 para e-mail existente, como exige o contrato da Parte 1. O login e a recuperação não revelam contas (hash fictício e resposta 202 idêntica).
- **I5 — Ollama.** O serviço oficial escuta em `127.0.0.1:11434` (`OLLAMA_HOST` padrão, conferido no journal da sessão anterior); o `OLLAMA_ORIGINS` padrão só aceita origens localhost. Durante esta revisão, o serviço estava **inativo**, então não foi possível conferir a porta em execução.
- **I6 — Dados pessoais.** Os mocks e o seed usam dados fictícios (`hayverson@patchnotes.dev`, `dev@patchnotes.dev`). Os e-mails criados nos testes ponta a ponta são aleatórios (`smoke-…@patchnotes.dev`) e ficaram no banco de **desenvolvimento** local.
- **I7 — Limpeza de dados.** Refresh e reset tokens expirados não são apagados, e mensagens `pending` de um processo encerrado no meio da geração ficam para sempre. Sugestão: um job periódico de limpeza.
- **I8 — Timeout do proxy de desenvolvimento.** O proxy do Next tem timeout de 30 s (`proxy-request.js`), menor que `OLLAMA_TOTAL_TIMEOUT=180`. Com o LLM lento (CPU ou primeira carga), `POST /api/chat/send` falha no proxy antes do backend responder. Com GPU, as respostas medidas ficaram em ~1 s.
- **I9 — JWT.** HS256 com segredo de pelo menos 32 caracteres (validado em `config.py`), algoritmo fixado na decodificação e claims `exp`/`iat`/`type` obrigatórias. Não há `iss`/`aud`: aceitável com um único serviço.

### Categorias sem evidência de problema durante a revisão

- **Injeção SQL.** Todo acesso usa ORM ou SQL parametrizado (`metrics.py:13-34`); não há concatenação.
- **Exposição em respostas.** Nenhuma resposta inclui hash de senha, token ou stack trace (`errors.py` e schemas `*Out`).
- **CSRF.** O cookie de refresh é `SameSite=Strict` com checagem de `Origin`. O access token vai em cabeçalho, e o backend não lê `patchnotes_token`.

Isso não equivale a afirmar segurança total.

---

## 5. Compatibilidade de contratos

**Coincide com a Parte 1** (`docs/API_CONTRACTS.md`, tipos em `src/modules/*/types`, `src/mocks/handlers.ts`): `POST /auth/login`, `POST /auth/register` (201), `GET /auth/me`, `GET /dashboard/metrics`, `/activity-heatmap`, `/token-usage?period=7d|30d` (outros valores viram `7d`), `/entries-by-tag`, `GET|POST /devlog/entries`, `GET /chat/history`, `POST /chat/send` (resposta não embrulhada), `GET|PATCH /profile`. Também batem:
- o corpo de erro `{message, details?: {formErrors, fieldErrors}}` com 400 para JSON malformado ou validação;
- datas ISO com milissegundos e `Z`;
- campos opcionais omitidos em vez de `null`.

Os testes do backend conferem esses formatos, e os 45 testes de contrato do MSW passam.

**Divergências ou adições (todas registradas como "adições aprovadas" no próprio contrato):**

| Item | Situação | Exige aprovação ou mudança? |
|---|---|---|
| `token` é JWT em vez de `mock-token-…` | O contrato define o token como opaco | Não |
| Limites extras de validação (nome ≤ 100, senha ≤ 128, devlog, URLs só http(s), `context` ≤ 4.000) | Mais restritivo que o MSW | Não, se o frontend respeitar; um texto válido no MSW e maior que o limite do backend gera 400 |
| Status 403, 413, 429, 503, 504 | Novos códigos | Já documentados; a UI mostra `message` |
| `tokensUsed` também nas mensagens do usuário | Campo já opcional | Não |
| `POST /auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password` | Endpoints novos | Já aprovados; o frontend os usa (commit `1a93297`) |
| `GET /dashboard/token-balance` | Endpoint novo | Já aprovado; **o frontend ainda não exibe o saldo** (não há tipo nem serviço em `src/modules/dashboard`) |
| WebSocket `/ws/chat` | Protocolo novo, fora de `/api` | Já aprovado; opcional via `NEXT_PUBLIC_CHAT_WS_URL`; o REST continua funcionando |
| Histórico de consumo | Atendido pelo `token-usage` da Parte 1 | Não |
| MSW: `/auth/refresh` sempre 401 | Diferente do backend real | Intencional e documentado; no MSW a sessão expira como antes |

**Mudanças que exigiriam novo contrato ou alteração do frontend** (não recomendadas como "compatíveis"): paginação de devlog ou histórico (S8), access token fora do cookie (S5), exibir o saldo de tokens na UI.

---

## 6. Verificações realizadas

| Comando / ferramenta | Resultado |
|---|---|
| `git status`, `git log` | Working tree limpo; HEAD `737728a` |
| `docker compose ps` | `postgres` e `mailpit` rodando (127.0.0.1) |
| `.venv/bin/python -m pytest -q` (backend) | **86 passaram**, 1 aviso de depreciação (`httpx` no `TestClient`) |
| `.venv/bin/alembic check` | "No new upgrade operations detected" |
| `npx tsc --noEmit` | sem erros |
| `npm run lint` | sem avisos nem erros |
| Script de reprodução do S1 (banco `patchnotes_test`, usuário descartável removido) | Confirmou o lost update |
| `git ls-files` + busca de padrões de segredo no código versionado e no histórico | Só credenciais de desenvolvimento/CI (I1) |
| `ss -ltn` | Postgres 5432, SMTP 1025 e Mailpit 8025 só em 127.0.0.1; Ollama **inativo** |
| Leitura de `proxy-request.js` do Next | Confirma que não há `X-Forwarded-For` (S2) |

**Não executado e por quê:**
- `npm audit` e `pip-audit`/OSV: enviam a lista de dependências a serviços externos, o que a instrução proíbe. As versões fixadas (Next 14.2.35, FastAPI 0.162.5, PyJWT 2.15.1, SQLAlchemy 2.1.8 etc.) **não foram checadas contra bases de CVE**. Next 14 é uma linha antiga; recomendo rodar o audit no CI.
- Testes contra o Ollama real: serviço inativo nesta revisão.
- Teste de carga do WebSocket (S3) e prova prática do S2 com o servidor Next: não feitos, para não gerar carga nem subir serviços. Os dois foram avaliados pelo código.
- `bun test src/mocks` não foi repetido nesta revisão (45 passaram na sessão anterior, sem mudanças no frontend desde então).

---

## 7. Plano recomendado (sem implementar)

1. **Corrigir o S1:** trocar o `merge` de `PATCH /profile` por um UPDATE só das colunas do perfil e criar um teste de regressão com a sequência reproduzida aqui.
2. **S3:** limitar conexões WebSocket (por usuário e por IP), adicionar timeout de inatividade e fechar conexões cujo token expirou.
3. **S2 e S4:** definir a topologia de produção (proxy reverso confiável), corrigir `client_ip` para confiar só no proxy e mover o rate limit para Redis, com TTL por chave.
4. **S5:** adicionar CSP e cabeçalhos de segurança no Next; cookie `Secure` em HTTPS.
5. **S6 e S7:** contar só falhas no limite por e-mail; usar `iat <= tokens_valid_after` ou versão de sessão.
6. **S8:** rate limit por usuário nas mutações de devlog e perfil. Paginação depende de aprovação de contrato.
7. Adicionar `npm audit`/`pip-audit` (ou Dependabot) no CI e avaliar a migração do Next 14.
8. Criar um job de limpeza para tokens expirados e mensagens `pending` órfãs (I7), e adotar logs estruturados com request-id.

---

## 8. Perguntas necessárias

1. **Topologia de produção:** o Next e o FastAPI ficarão atrás de um proxy reverso (nginx, Caddy, balanceador)? O rewrite do Next será usado fora do desenvolvimento? A correção segura do S2 depende de saber **quem** define o IP do cliente. Sem isso, ou os limites ficam globais, ou podem ser contornados.
2. **Haverá mais de um processo ou réplica do backend?** Se sim, rate limit e limite de conexões WebSocket (S3, S4) precisam de armazenamento compartilhado (Redis), o que adiciona uma dependência de infraestrutura.
3. **Paginação de `GET /devlog/entries` (e do histórico do chat):** aceita uma mudança de contrato, por exemplo `?cursor=`/`limit` mantendo a resposta atual como padrão? Sem paginação, a única mitigação compatível para o S8 é limitar a criação.
4. **Saldo de tokens na UI:** quer que o dashboard exiba `GET /dashboard/token-balance`? O endpoint existe e está aprovado, mas mostrá-lo exige mudar o frontend (tipo, serviço e componente).
