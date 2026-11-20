# Registro de mudanças — Patchnotes

Catálogo das mudanças relevantes, da mais recente para a mais antiga. Cada item aponta o commit ou indica que a mudança foi feita no ambiente, fora do repositório.

## 18/11/2026 — correção dos riscos residuais (branch `develop`)

- `d7e7542` Redis do Docker com senha.
- `e35459e`, `03e6f70` Access token em cookie HttpOnly (fora do corpo e do JavaScript), proteção CSRF nas escritas por cookie e no login, WebSocket pelo cookie do handshake. Cadastro com confirmação por e-mail (resposta idêntica para qualquer e-mail; migration 0005) e tela `/verify-email`.
- `58b7738` Foto de perfil por upload (migration 0006), CSP `img-src` só do próprio site; logout espera a API e recarrega a página.
- `25d1bc6` `docker-compose.prod.yml` com Caddy (HTTPS, HSTS), API em produção e Swagger desligado.
- Verificação: 160 testes no backend, 31 unitários, 22 cenários E2E em Chromium, Firefox e WebKit (também contra a produção em HTTPS) e 44 ataques bloqueados.

## 18/11/2026 — vistoria de segurança (branch `develop`)

- **Dependências:** Next 15.5.29 e React 19 (Next 14 tinha 3 alertas de execução remota de código); `shadcn` CLI fora da produção; `npm audit` e `pip-audit` sem vulnerabilidades.
- **API:** `Cache-Control: no-store` e cabeçalhos de segurança em todas as respostas.
- **Docker:** backend e frontend com `no-new-privileges` e `cap_drop: ALL`; nginx esconde `X-Powered-By`.
- Detalhes, ataques testados e riscos residuais em `docs/SEGURANCA.md`.

## 18/11/2026 — testes e melhorias (branch `develop`)

- **Testes do frontend:** Vitest com 30 testes (conexão do chat com WebSocket falso, renovação de sessão no Axios, CSP, endereço do WebSocket).
- **Ponta a ponta:** Playwright com 17 cenários em Chromium, Firefox e WebKit contra o app real; Ollama falso (`e2e/fake-ollama.mjs`) para rodar sem GPU; job `e2e` na CI.
- **Docker:** nginx como entrada única (`/api`, `/ws`, `/docs` no mesmo endereço), `X-Forwarded-For` sobrescrito e `TRUSTED_PROXIES` só com o IP fixo do proxy; `docker-compose.gpu.yml`.
- **Correções encontradas pelos testes:** 500 na renderização do `/chat` no servidor; CSP com `upgrade-insecure-requests` em HTTP quebrava o Safari; formulários sem `method="post"` punham a senha na URL sem JavaScript.
- **Backend:** TestClient com `httpx2` (sem aviso de depreciação).

## 18/11/2026 — integração final (branch `develop`)

- **Tokens:** saldo, extrato e recarga simulada (`/api/tokens/*`, migration 0004) e a tela `/tokens`. O bloqueio do chat por cota considera as recargas.
- **Chat:** WebSocket como único canal de envio, com aviso de queda, reconexão automática e tokens por mensagem.
- **MSW removido:** todas as telas consomem a API real; o rewrite `/api/*` aponta para `API_URL` (padrão `http://localhost:8000`).
- **Ambiente:** `docker-compose.yml` na raiz sobe frontend, API, PostgreSQL, Redis, Ollama e Mailpit; Dockerfiles do frontend e do backend; `.env.example` na raiz.
- **Swagger** em `/docs` com o protocolo do WebSocket descrito; `GET /api/health`.

## 12/11/2026

### Decisões de segurança registradas
- **S5:** o access token continua legível por JavaScript; não haverá migração para cookie `HttpOnly`.
- **Cadastro:** o 409 para e-mail existente continua, conforme o contrato da Parte 1.
- Os dois riscos foram aceitos e documentados em `docs/SEGURANCA.md` (mitigações em vigor e risco residual). Sem mudança de código.

### Correções da revisão de segurança (`b4f7c8a` … `7a2dafe`)
Status completo em `docs/SEGURANCA.md`.
- `b4f7c8a` **S1:** `PATCH /profile` não desfaz mais uma redefinição de senha concorrente.
- `92e1a7d` **S8:** versão de sessão no JWT (`sv`) no lugar de `tokens_valid_after` (migration 0002).
- `80d04cc` **S2/S4:** limites no Redis (várias réplicas) e IP do cliente só via `TRUSTED_PROXIES`; `python -m app` como comando oficial; Redis no compose e na CI.
- `5d2dc5e` **S3:** limites de conexões WebSocket por conta e por IP, inatividade e expiração do token.
- `e824a85` **S7:** recuperação de senha sem diferença de tempo entre contas. `d042a00` corrige um teste instável.
- `ae4bf6c` **Limpeza:** `python -m app.scripts.cleanup` em lotes (migration 0003, índices).
- `a4e6bbe` **Devlog/perfil:** paginação por cursor compatível e limites de escrita.
- `7a2dafe` **Frontend:** CSP com nonce, cabeçalhos de segurança, `Secure` no cookie em HTTPS; o middleware do Next passou a ser executado (estava fora de `src/`).
- Novas variáveis: `REDIS_URL`, `TRUSTED_PROXIES`, `TEST_REDIS_URL`, `WS_MAX_CONNECTIONS_PER_USER`, `WS_MAX_CONNECTIONS_PER_IP`, `WS_IDLE_TIMEOUT_SECONDS`, `WS_SLOT_TTL_SECONDS`. Removida: `TRUST_PROXY_HEADERS` (definida como `true`, impede a inicialização).

### `docs(revisão)` — revisão de arquitetura e segurança
- `docs/REVISAO_ARQUITETURA_SEGURANCA.md`: revisão estática do frontend e do backend (somente relatório, sem mudança de código).
- Principal achado: **S1 (alta, comprovado)** — `PATCH /profile` usa `session.merge` e pode desfazer uma redefinição de senha concorrente (hash antigo e `tokens_valid_after` regravados). Demais: IP do cliente atrás do rewrite do Next (S2), WebSocket sem limite de conexões (S3), limpeza do rate limiter (S4), cookie de access token legível por JS e sem CSP (S5), entre outros.
- Verificações: `pytest` 86 ok, `alembic check` sem diferenças, `tsc` e `lint` sem erros. `npm audit`/`pip-audit` não executados (enviariam dados a serviços externos).

### Ambiente local (fora do git)
- **Ollama oficial com CUDA instalado** (0.40.16, via `https://ollama.com/install.sh`, revisado antes de rodar). Substitui o pacote do Fedora (0.12.11), que só roda em CPU em GPUs NVIDIA. O serviço em `/etc/systemd/system/ollama.service` tem prioridade sobre o do pacote; modelos continuam em `/var/lib/ollama`. O pacote `ollama` do Fedora ainda está instalado, mas não é usado.
- **Medido:** `qwen2.5:3b` 100% na RTX 3050 (≈2,1 GB de VRAM), ≈75 tokens/s, carga a frio ≈3 s. Pelo WebSocket, 1º token em ≈0,1 s (antes, em CPU: ≈7,6 s e ≈6 tokens/s).
- PostgreSQL e Mailpit sobem com `docker compose up -d --wait` em `backend/`.

### `ci` — `167baad`
- `.github/workflows/ci.yml`: pytest contra PostgreSQL, checagem das migrations e verificações do frontend.

### `docs` — `aecaa13`
- `docs/API_CONTRACTS.md` passa a ser versionado (`.gitignore`); `RELATORIO_REVISAO.md` e `CONTEXTO_IA.md` continuam locais.
- Contratos: access token de 15 min e seção "Uso pelo frontend" (renovação automática, logout, telas de recuperação, comportamento do MSW).
- `backend/README.md`: instalação do Ollama oficial com CUDA, desempenho medido, contexto reduzido para GPU de 4 GB, pendências atualizadas.
- `README.md`: status do projeto.

### `feat(auth)` — `1a93297`
- Axios renova a sessão com `POST /auth/refresh` num 401 (uma renovação compartilhada; rotas de auth não disparam refresh).
- Chat via WebSocket renova o token e reenvia uma vez quando recusado com `4401`.
- "Sair" chama `POST /auth/logout` (revoga o refresh token) e limpa a sessão local.
- Telas `/forgot-password` e `/reset-password` (token lido do fragmento `#token=` e apagado da barra de endereço); link "Esqueci minha senha" no login.
- Cookie `patchnotes_token` com 7 dias (validade do refresh token); cache do React Query limpo ao entrar.
- MSW: handlers de refresh (sempre 401), logout (204), forgot (202) e reset (token fixo de teste), com testes de contrato.

### `chore(backend)` — `38c8113`
- Access token de 15 min (antes 24h), possível porque o frontend agora renova a sessão.
- `OLLAMA_NUM_CTX` 4096 → 2048 e `CHAT_CONTEXT_MESSAGES` 10 → 6, para caber em GPUs de 4 GB.

## Verificações registradas (12/11/2026)
- Backend: `pytest -q` → 86 passaram. `alembic upgrade head` → `0001`.
- Frontend: `tsc --noEmit` e `npm run lint` sem erros; `bun test src/mocks` → 45 passaram.
- Teste ponta a ponta com API, PostgreSQL, Mailpit e Ollama reais: cadastro, login, perfil, devlog, refresh, recuperação de senha (uso único), chat via WebSocket, histórico, métricas, consumo e saldo de tokens. Nenhum token ou senha nos logs da API.
