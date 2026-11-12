# Segurança — Patchnotes

Configuração de segurança em vigor e status dos achados da [revisão de 12/11/2026](./REVISAO_ARQUITETURA_SEGURANCA.md). Detalhes de execução em [`backend/README.md`](../backend/README.md); contratos em [`API_CONTRACTS.md`](./API_CONTRACTS.md).

## Status dos achados

| Achado | Status | Correção | Commit |
|---|---|---|---|
| **S1** Alta — `PATCH /profile` desfazia redefinição de senha concorrente | corrigido | `UPDATE … RETURNING` só das colunas de perfil; teste injeta a redefinição entre autenticação e gravação | `d446ece` |
| **S8** — janela de 1 s em `tokens_valid_after` | corrigido | versão de sessão inteira no JWT (`sv`), incrementada atomicamente na redefinição; migration 0002 | `502c8a8` |
| **S2** — IP do cliente atrás do proxy | corrigido | `TRUSTED_PROXIES` + leitura do `X-Forwarded-For` da direita para a esquerda; `python -m app` desliga o `proxy_headers` do uvicorn; falhas de login por (e-mail, IP) | `6424da7` |
| **S4** (revisão) — limpeza do rate limiter apagava limites longos | corrigido | janela guardada por balde, limpeza incremental; Redis com TTL por chave | `6424da7` |
| Várias réplicas | implementado | limites e vagas de WebSocket no Redis (scripts Lua atômicos); `REDIS_URL` obrigatório em production; falha fechada (503) | `6424da7`, `1b169cf` |
| **S3** — WebSocket sem limites | corrigido | vagas por IP e por conta com heartbeat, inatividade (4408), expiração do token (4401) | `1b169cf` |
| **S4** (pedido) — limpeza síncrona de registros | corrigido | não havia limpeza; criada rotina em lote fora da requisição, com índices e advisory lock | `02e3d24` |
| **S7** — enumeração de e-mail | corrigido em parte; **risco aceito** | `forgot-password` faz todo o trabalho depois da resposta. Login já era uniforme. O 409 do cadastro continua por decisão (12/11/2026) | `072768f` |
| **S8** (revisão) — devlog/perfil sem limites e paginação | corrigido | paginação por cursor compatível; 30 criações/min de devlog e 20 edições/min de perfil por usuário | `5956455` |
| **S6** — sem CSP | corrigido | CSP com nonce por requisição e cabeçalhos de segurança | `a4488ec` |
| **S5** — access token legível por JavaScript | parcial; **risco aceito** | `Secure` no cookie em HTTPS e CSP estrita reduzem o risco. O token continua legível por JavaScript por decisão (12/11/2026) | `a4488ec` |
| Middleware do Next nunca executava | corrigido (achado novo) | `middleware.ts` estava na raiz; com `src/`, o Next só lê `src/middleware.ts` | `a4488ec` |

## Content Security Policy (frontend)

Montada em `src/lib/security-headers.ts` e aplicada por `src/middleware.ts` a todas as páginas, com nonce novo a cada requisição. O layout raiz lê `headers()` para que todas as páginas sejam renderizadas sob demanda; páginas estáticas teriam scripts sem nonce.

| Diretiva | Produção | Por quê |
|---|---|---|
| `script-src` | `'self' 'nonce-…' 'strict-dynamic'` | sem `'unsafe-inline'` nem `'unsafe-eval'` |
| `style-src` | `'self' 'unsafe-inline'` | **exceção:** atributos `style` gerados pelo React no SSR (gráficos, heatmap, animações) não aceitam nonce. CSS não executa código |
| `img-src` | `'self' data: blob: https:` | `avatarUrl` é uma URL livre do perfil |
| `connect-src` | `'self'` + origem de `NEXT_PUBLIC_CHAT_WS_URL` | API pelo próprio origin; WebSocket do chat |
| `worker-src` | `'self'` | service worker do MSW (desenvolvimento) |
| `object-src`, `base-uri`, `form-action`, `frame-ancestors` | `'none'`, `'self'`, `'self'`, `'none'` | |
| `upgrade-insecure-requests` | só em produção | |

Só em desenvolvimento: `'unsafe-eval'` (React Refresh), `ws:` (HMR) e `http:` em imagens.

O Zod 4 testaria `new Function("")` ao criar cada schema e geraria um relatório de violação por página. Os schemas importam `z` de `src/lib/zod.ts`, que liga `jitless`.

Outros cabeçalhos (`next.config.mjs`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, HSTS em produção, sem `X-Powered-By`.

**Verificação (12/11/2026):** Chrome headless via DevTools Protocol, em tempo real. Foram testadas 7 páginas, em dev com MSW e em produção com backend real. Nenhuma violação de CSP. O WebSocket do chat abre, e a conexão a outro destino é bloqueada. Um controle negativo (script inline sem nonce) foi bloqueado, o que confirma que o detector funciona.

## Proxy, IP do cliente e réplicas

- Inicie a API com `python -m app` (desliga o `proxy_headers` do uvicorn e fixa `ws_max_size`).
- `TRUSTED_PROXIES`: IPs ou CIDR dos proxies reversos que **sobrescrevem** o `X-Forwarded-For`. Nunca liste o servidor Next.js (o rewrite repassa o cabeçalho do cliente) nem `0.0.0.0/0` (recusado na inicialização).
- Topologia recomendada para produção: proxy reverso → `/api` e `/ws` direto na API (várias réplicas) e o resto no Next. Com o nginx, use `proxy_set_header X-Forwarded-For $remote_addr;`.
- `REDIS_URL` obrigatório em production. Limites de requisição e vagas de WebSocket ficam compartilhados. Se o Redis cair, os limites falham fechados (HTTP 503; WebSocket fecha com 1013).

## Sessões

- Access token JWT de 15 min com claim `sv` (versão de sessão). A redefinição de senha incrementa a versão e revoga todos os refresh tokens.
- Refresh token opaco em cookie `HttpOnly`, `SameSite=Strict`, path `/api/auth` (`Secure` em produção), rotacionado a cada uso, com detecção de reuso.
- O logout revoga a família do refresh token. O access token em uso continua válido até expirar (no máximo 15 min). Não existe "sair de todos os dispositivos" além da redefinição de senha.

## Manutenção

`python -m app.scripts.cleanup`, agendado (ex.: a cada hora): exclusões em lote fora do caminho das requisições, seguro em várias réplicas. Exemplo de timer em `backend/README.md`.

## Decisões registradas (12/11/2026)

1. **S5 — o access token continua legível por JavaScript.** Ele fica em `patchnotes_token`, porque o Axios o envia em `Authorization` e o WebSocket o manda na primeira mensagem. Mover para um cookie `HttpOnly` mudaria o contrato de `login`/`register`/`refresh`, o Axios, a autenticação do WebSocket e exigiria proteção CSRF; ficou decidido manter o estado atual.
   - Mitigações em vigor: CSP com nonce sem `'unsafe-inline'`/`'unsafe-eval'` em scripts, `Secure` em HTTPS, `SameSite=Strict`, access token de 15 min e refresh token em cookie `HttpOnly`.
   - Risco residual: um XSS que passe pela CSP pode ler o token e usá-lo até expirar.
2. **Cadastro mantém o 409.** `POST /auth/register` responde 409 para e-mail existente, como manda o contrato da Parte 1. Ficou decidido manter o fluxo atual.
   - Mitigação em vigor: limite por IP no cadastro.
   - Risco residual: é possível descobrir se um e-mail tem conta, em ritmo limitado.

Reabrir essas decisões exige mudança de contrato e de frontend.
