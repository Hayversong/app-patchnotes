# Segurança — Patchnotes

Configuração de segurança em vigor e status dos achados da [revisão de 12/11/2026](./REVISAO_ARQUITETURA_SEGURANCA.md). Detalhes de execução em [`backend/README.md`](../backend/README.md); contratos em [`API_CONTRACTS.md`](./API_CONTRACTS.md).

## Status dos achados

| Achado | Status | Correção | Commit |
|---|---|---|---|
| **S1** Alta — `PATCH /profile` desfazia redefinição de senha concorrente | corrigido | `UPDATE … RETURNING` só das colunas de perfil; teste injeta a redefinição entre autenticação e gravação | `b4f7c8a` |
| **S8** — janela de 1 s em `tokens_valid_after` | corrigido | versão de sessão inteira no JWT (`sv`), incrementada atomicamente na redefinição; migration 0002 | `92e1a7d` |
| **S2** — IP do cliente atrás do proxy | corrigido | `TRUSTED_PROXIES` + leitura do `X-Forwarded-For` da direita para a esquerda; `python -m app` desliga o `proxy_headers` do uvicorn; falhas de login por (e-mail, IP) | `80d04cc` |
| **S4** (revisão) — limpeza do rate limiter apagava limites longos | corrigido | janela guardada por balde, limpeza incremental; Redis com TTL por chave | `80d04cc` |
| Várias réplicas | implementado | limites e vagas de WebSocket no Redis (scripts Lua atômicos); `REDIS_URL` obrigatório em production; falha fechada (503) | `80d04cc`, `5d2dc5e` |
| **S3** — WebSocket sem limites | corrigido | vagas por IP e por conta com heartbeat, inatividade (4408), expiração do token (4401) | `5d2dc5e` |
| **S4** (pedido) — limpeza síncrona de registros | corrigido | não havia limpeza; criada rotina em lote fora da requisição, com índices e advisory lock | `ae4bf6c` |
| **S7** — enumeração de e-mail | corrigido | `forgot-password` e, desde 18/11, também o cadastro respondem igual para qualquer e-mail e fazem o trabalho depois da resposta; a conta nasce na confirmação do e-mail | `e824a85`, `e35459e` |
| **S8** (revisão) — devlog/perfil sem limites e paginação | corrigido | paginação por cursor compatível; 30 criações/min de devlog e 20 edições/min de perfil por usuário | `a4e6bbe` |
| **S6** — sem CSP | corrigido | CSP com nonce por requisição e cabeçalhos de segurança | `7a2dafe` |
| **S5** — access token legível por JavaScript | corrigido (18/11) | token em cookie HttpOnly (`patchnotes_access`), fora do corpo das respostas; escritas por cookie exigem origem do próprio site (CSRF) | `e35459e`, `03e6f70` |
| Middleware do Next nunca executava | corrigido (achado novo) | `middleware.ts` estava na raiz; com `src/`, o Next só lê `src/middleware.ts` | `7a2dafe` |

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
| `upgrade-insecure-requests` | só em produção **e** com a página servida por HTTPS (direto ou `X-Forwarded-Proto: https`) | Em HTTP o Safari/WebKit trocava `http://localhost` por `https://` e nenhum script carregava (corrigido em 18/11/2026) |

Só em desenvolvimento: `'unsafe-eval'` (React Refresh), `ws:` (HMR) e `http:` em imagens.

O Zod 4 testaria `new Function("")` ao criar cada schema e geraria um relatório de violação por página. Os schemas importam `z` de `src/lib/zod.ts`, que liga `jitless`.

Outros cabeçalhos (`next.config.mjs`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, HSTS em produção, sem `X-Powered-By`.

**Verificação (18/11/2026):** suíte Playwright em Chromium, Firefox e WebKit confere que nenhuma tela gera erro de console ou violação de CSP; formulários usam `method="post"`, então mesmo sem JavaScript as credenciais não vão para a URL.

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

## Vistoria de 18/11/2026

Varredura automática (`npm audit`, `pip-audit`, `bandit`), revisão do código e 40 ataques reais contra o ambiente Docker (script com JWT `alg=none` e adulterado, IDOR entre contas, URLs `javascript:`/`data:`, mass assignment, corpo gigante, valores de recarga arbitrários, CORS e CSRF de outra origem, WebSocket de outra origem, com token adulterado, mensagem e frame grandes demais, refresh depois do logout, cabeçalhos e endpoints expostos). Depois das correções, os 40 foram bloqueados.

| Achado | Gravidade | Correção | Commit |
|---|---|---|---|
| Next.js 14.2 sem suporte: 24 alertas, incluindo 3 de execução remota de código no otimizador de imagens, SSRF em rewrites e WebSocket, XSS com nonce de CSP e DoS | crítica | Next 15.5.29 + React 19; otimizador de imagens desligado (`images.unoptimized`) | `f9974bf` |
| `shadcn` (CLI) nas dependências de produção, levando hono, SDK do MCP e `systeminformation` para a imagem | alta | removido | `f9974bf` |
| `zod`, `follow-redirects`, `qs`, `undici`, `postcss` (interno do Next) com alertas | média–alta | atualizados / `overrides`; `npm audit`: 0 | `f9974bf` |
| Login, cadastro e refresh devolviam o access token sem `Cache-Control` | média | `no-store` em toda a API | `5b8d1f6` |
| Respostas da API sem `nosniff`, `X-Frame-Options` e CSP | baixa | middleware de cabeçalhos (CSP `default-src 'none'`, exceto Swagger) | `5b8d1f6` |
| Containers com capacidades padrão do kernel | baixa | `no-new-privileges` e `cap_drop: ALL` no backend e no frontend | `3f096a1` |
| CSP com `upgrade-insecure-requests` em HTTP quebrava o Safari; formulários sem POST punham a senha na URL sem JavaScript | média | corrigidos na rodada de testes | `73d7535` |

Conferido e sem problema: JWT com algoritmo fixo e verificação de expiração e versão de sessão; SQL sempre parametrizado; nenhum `dangerouslySetInnerHTML`, `eval` ou redirecionamento controlado pelo usuário; nenhum segredo no histórico do git; logs registram só o tipo do erro; respostas de erro sem stack trace; isolamento entre contas; `pip-audit` sem vulnerabilidades; avisos do `bandit` são falsos positivos (mensagens de texto e a senha do seed, que recusa rodar em produção).

### Riscos que ficaram da vistoria (corrigidos em 18/11/2026)

| Risco | Correção | Commit |
|---|---|---|
| Access token legível por JavaScript (S5) | Cookie `patchnotes_access` HttpOnly + SameSite=Strict; corpo das respostas sem token; API aceita cookie ou `Authorization`; escritas pelo cookie exigem `Origin`/`Sec-Fetch-Site` do próprio site (também login, cadastro e refresh: sem login CSRF); WebSocket autentica pelo cookie do handshake, com `Origin` conferido | `e35459e`, `03e6f70` |
| Cadastro revelava e-mails existentes (409) | Resposta 202 idêntica para qualquer e-mail, trabalho depois da resposta; conta criada só com o link de confirmação (uso único, 24 h); senha guardada no pedido pendente, então cadastrar o e-mail alheio não gera conta com a senha do atacante | `e35459e`, `03e6f70` |
| Avatar por URL externa (IP de quem via ia para o servidor da imagem; CSP com `img-src https:`) | Upload do arquivo, servido por `/api/profile/avatar`; tipo pela assinatura (PNG/JPEG/WebP; SVG/HTML recusados), 256 KB; CSP `img-src 'self' data: blob:` | `58b7738` |
| Redis sem senha no Docker | `--requirepass` com `REDIS_PASSWORD` | `d7e7542` |
| Docker só em modo desenvolvimento (HTTP, cookies sem `Secure`, Swagger aberto) | `docker-compose.prod.yml`: Caddy com HTTPS automático e HSTS, API em `production` (cookies `Secure`, Swagger desligado, sem porta exposta) | `25d1bc6` |

**Verificação:** 160 testes no backend; 22 cenários ponta a ponta em Chromium, Firefox e WebKit; os mesmos 22 contra a instalação de produção em HTTPS (Chromium e Firefox); `entrega/ataques-seguranca.py` com 44 ataques, todos bloqueados na instalação de produção.

### O que continua (consciente)

- **XSS ainda age dentro da página:** com o token em HttpOnly, um script injetado não consegue roubá-lo, mas poderia fazer requisições como a pessoa enquanto a página estiver aberta. A CSP com nonce é a barreira para isso.
- **Certificado local em `SITE_ADDRESS=localhost`:** o navegador avisa; num domínio de verdade o Caddy emite um certificado Let's Encrypt.
- **E-mail:** sem `SMTP_*` configurado, os e-mails de confirmação ficam no Mailpit.

## Decisões registradas (12/11/2026) — revistas em 18/11/2026

> As duas decisões abaixo foram revertidas em 18/11/2026 (ver tabela acima). Ficam como registro.

1. **S5 — o access token continua legível por JavaScript.** Ele fica em `patchnotes_token`, porque o Axios o envia em `Authorization` e o WebSocket o manda na primeira mensagem. Mover para um cookie `HttpOnly` mudaria o contrato de `login`/`register`/`refresh`, o Axios, a autenticação do WebSocket e exigiria proteção CSRF; ficou decidido manter o estado atual.
   - Mitigações em vigor: CSP com nonce sem `'unsafe-inline'`/`'unsafe-eval'` em scripts, `Secure` em HTTPS, `SameSite=Strict`, access token de 15 min e refresh token em cookie `HttpOnly`.
   - Risco residual: um XSS que passe pela CSP pode ler o token e usá-lo até expirar.
2. **Cadastro mantém o 409.** `POST /auth/register` responde 409 para e-mail existente, como manda o contrato da Parte 1. Ficou decidido manter o fluxo atual.
   - Mitigação em vigor: limite por IP no cadastro.
   - Risco residual: é possível descobrir se um e-mail tem conta, em ritmo limitado.

Reabrir essas decisões exige mudança de contrato e de frontend.
