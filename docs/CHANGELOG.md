# Registro de mudanças — Patchnotes

Catálogo das mudanças relevantes, da mais recente para a mais antiga. Cada item aponta o commit (branch `implementando-backend`) ou indica que a mudança foi feita no ambiente, fora do repositório.

## 12/11/2026

### Correções da revisão de segurança (`d446ece` … `a4488ec`)
Status completo em `docs/SEGURANCA.md`.
- `d446ece` **S1:** `PATCH /profile` não desfaz mais uma redefinição de senha concorrente.
- `502c8a8` **S8:** versão de sessão no JWT (`sv`) no lugar de `tokens_valid_after` (migration 0002).
- `6424da7` **S2/S4:** limites no Redis (várias réplicas) e IP do cliente só via `TRUSTED_PROXIES`; `python -m app` como comando oficial; Redis no compose e na CI.
- `1b169cf` **S3:** limites de conexões WebSocket por conta e por IP, inatividade e expiração do token.
- `072768f` **S7:** recuperação de senha sem diferença de tempo entre contas. `0caa544` corrige um teste instável.
- `02e3d24` **Limpeza:** `python -m app.scripts.cleanup` em lotes (migration 0003, índices).
- `5956455` **Devlog/perfil:** paginação por cursor compatível e limites de escrita.
- `a4488ec` **Frontend:** CSP com nonce, cabeçalhos de segurança, `Secure` no cookie em HTTPS; o middleware do Next passou a ser executado (estava fora de `src/`).
- Novas variáveis: `REDIS_URL`, `TRUSTED_PROXIES`, `TEST_REDIS_URL`, `WS_MAX_CONNECTIONS_PER_USER`, `WS_MAX_CONNECTIONS_PER_IP`, `WS_IDLE_TIMEOUT_SECONDS`, `WS_SLOT_TTL_SECONDS`. Removida: `TRUST_PROXY_HEADERS` (definida como `true`, impede a inicialização).

### `docs(revisão)` — revisão de arquitetura e segurança
- `docs/REVISAO_ARQUITETURA_SEGURANCA.md`: revisão estática do frontend e do backend (somente relatório, sem mudança de código).
- Principal achado: **S1 (alta, comprovado)** — `PATCH /profile` usa `session.merge` e pode desfazer uma redefinição de senha concorrente (hash antigo e `tokens_valid_after` regravados). Demais: IP do cliente atrás do rewrite do Next (S2), WebSocket sem limite de conexões (S3), limpeza do rate limiter (S4), cookie de access token legível por JS e sem CSP (S5), entre outros.
- Verificações: `pytest` 86 ok, `alembic check` sem diferenças, `tsc` e `lint` sem erros. `npm audit`/`pip-audit` não executados (enviariam dados a serviços externos).

### Ambiente local (fora do git)
- **Ollama oficial com CUDA instalado** (0.40.16, via `https://ollama.com/install.sh`, revisado antes de rodar). Substitui o pacote do Fedora (0.12.11), que só roda em CPU em GPUs NVIDIA. O serviço em `/etc/systemd/system/ollama.service` tem prioridade sobre o do pacote; modelos continuam em `/var/lib/ollama`. O pacote `ollama` do Fedora ainda está instalado, mas não é usado.
- **Medido:** `qwen2.5:3b` 100% na RTX 3050 (≈2,1 GB de VRAM), ≈75 tokens/s, carga a frio ≈3 s. Pelo WebSocket, 1º token em ≈0,1 s (antes, em CPU: ≈7,6 s e ≈6 tokens/s).
- PostgreSQL e Mailpit sobem com `docker compose up -d --wait` em `backend/`.

### `ci` — `f6dcf67`
- `.github/workflows/ci.yml`: pytest contra PostgreSQL, checagem das migrations e verificações do frontend.

### `docs` — `cb19b56`
- `docs/API_CONTRACTS.md` passa a ser versionado (`.gitignore`); `RELATORIO_REVISAO.md` e `CONTEXTO_IA.md` continuam locais.
- Contratos: access token de 15 min e seção "Uso pelo frontend" (renovação automática, logout, telas de recuperação, comportamento do MSW).
- `backend/README.md`: instalação do Ollama oficial com CUDA, desempenho medido, contexto reduzido para GPU de 4 GB, pendências atualizadas.
- `README.md`: status do projeto.

### `feat(auth)` — `81ca418`
- Axios renova a sessão com `POST /auth/refresh` num 401 (uma renovação compartilhada; rotas de auth não disparam refresh).
- Chat via WebSocket renova o token e reenvia uma vez quando recusado com `4401`.
- "Sair" chama `POST /auth/logout` (revoga o refresh token) e limpa a sessão local.
- Telas `/forgot-password` e `/reset-password` (token lido do fragmento `#token=` e apagado da barra de endereço); link "Esqueci minha senha" no login.
- Cookie `patchnotes_token` com 7 dias (validade do refresh token); cache do React Query limpo ao entrar.
- MSW: handlers de refresh (sempre 401), logout (204), forgot (202) e reset (token fixo de teste), com testes de contrato.

### `chore(backend)` — `eb22af6`
- Access token de 15 min (antes 24h), possível porque o frontend agora renova a sessão.
- `OLLAMA_NUM_CTX` 4096 → 2048 e `CHAT_CONTEXT_MESSAGES` 10 → 6, para caber em GPUs de 4 GB.

## Verificações registradas (12/11/2026)
- Backend: `pytest -q` → 86 passaram. `alembic upgrade head` → `0001`.
- Frontend: `tsc --noEmit` e `npm run lint` sem erros; `bun test src/mocks` → 45 passaram.
- Teste ponta a ponta com API, PostgreSQL, Mailpit e Ollama reais: cadastro, login, perfil, devlog, refresh, recuperação de senha (uso único), chat via WebSocket, histórico, métricas, consumo e saldo de tokens. Nenhum token ou senha nos logs da API.
