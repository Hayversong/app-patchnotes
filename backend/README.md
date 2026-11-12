# Patchnotes — Backend (Parte 2)

API em **FastAPI** (assíncrona) com **PostgreSQL**, **Alembic**, **Pydantic** e LLM local via **Ollama**. Implementa os mesmos endpoints e formatos da Parte 1 (`docs/API_CONTRACTS.md`), de modo que o frontend troca o MSW pela API real sem alterar telas ou componentes.

## Arquitetura

```text
backend/
├── app/
│   ├── main.py              # fábrica da aplicação (middlewares, routers, ciclo de vida)
│   ├── core/                # configuração, segurança (Argon2/JWT), erros, limites, middleware
│   ├── db/                  # engine e sessões assíncronas
│   ├── models/              # tabelas SQLAlchemy
│   ├── schemas/             # entrada/saída Pydantic (JSON em camelCase, como o contrato)
│   ├── repositories/        # acesso a dados (ORM / SQL parametrizado)
│   ├── services/            # regras de negócio: auth, chat, LLM, dashboard, cota, e-mail
│   ├── routers/             # rotas REST (/api/...) e WebSocket (/ws/chat)
│   └── scripts/seed.py      # dados fictícios de desenvolvimento
├── migrations/              # Alembic (versionadas)
├── tests/                   # pytest contra PostgreSQL real, LLM e e-mail simulados
├── docker-compose.yml       # PostgreSQL + Mailpit (somente 127.0.0.1)
└── .env.example             # todas as variáveis, sem segredos
```

Regras seguidas: rotas `async def` para I/O; nenhuma lógica em `main.py`; nada de `asyncio.run()` em rotas; **nenhuma sessão, transação ou lock de banco fica aberto enquanto o LLM gera** (o pedido é gravado numa transação curta, o streaming ocorre sem banco e a resposta é gravada em outra transação curta — há teste que confere que o pool está com 0 conexões em uso durante a geração).

## Pré-requisitos

| Ferramenta | Para quê |
|---|---|
| Python ≥ 3.12 (testado com 3.14) | executar a API |
| Docker + Docker Compose | PostgreSQL 17 e Mailpit em desenvolvimento |
| Ollama | LLM local (`qwen2.5:3b` por padrão) |
| Node.js ≥ 20 | frontend |

## Instalação e inicialização

```bash
cd backend

# 1. Ambiente Python
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt   # requirements.txt para produção

# 2. Configuração
cp .env.example .env
# Edite .env: defina POSTGRES_PASSWORD (e use a mesma em DATABASE_URL/TEST_DATABASE_URL)
# e gere JWT_SECRET:  python3 -c "import secrets; print(secrets.token_urlsafe(48))"

# 3. PostgreSQL + Mailpit (portas presas a 127.0.0.1)
docker compose up -d --wait
# Na primeira subida, docker/postgres-init cria também o banco de testes patchnotes_test.

# 4. Migrations
.venv/bin/alembic upgrade head

# 5. (opcional) Conta fictícia: dev@patchnotes.dev / patchnotes123
.venv/bin/python -m app.scripts.seed

# 6. API
.venv/bin/uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000 --ws-max-size 65536
```

Documentação interativa (fora de produção): http://127.0.0.1:8000/api/docs. E-mails de desenvolvimento: http://localhost:8025.

### Ollama

```bash
sudo systemctl enable --now ollama   # escuta só em 127.0.0.1:11434 por padrão
ollama pull qwen2.5:3b               # ~1,9 GB; cabe numa GPU de 4 GB
```

Não exponha a porta 11434 publicamente (não defina `OLLAMA_HOST=0.0.0.0` sem firewall). Modelo, URL, temperatura, contexto, limite de tokens e tempos limite são configuráveis em `.env` (`OLLAMA_*`). Sem Ollama, a API continua no ar: o chat responde **503** (REST) ou um evento `error` com `code: "llm_unavailable"` (WebSocket).

### Frontend usando o backend real

Na raiz do projeto:

```bash
API_URL=http://127.0.0.1:8000 \
NEXT_PUBLIC_API_MOCKING=disabled \
NEXT_PUBLIC_CHAT_WS_URL=ws://127.0.0.1:8000/ws/chat \
npm run dev
```

- `API_URL` liga um *rewrite* do Next: `/api/*` → FastAPI no **mesmo origin** (o cookie de refresh continua first-party e não precisa de CORS).
- `NEXT_PUBLIC_API_MOCKING=disabled` desliga o MSW. Sem essas variáveis, o frontend segue exatamente como na Parte 1 (MSW).
- `NEXT_PUBLIC_CHAT_WS_URL` faz a tela do chat usar o WebSocket, com a resposta aparecendo token a token. O WebSocket não passa pelo rewrite, então conecta direto no backend, e a origem do frontend precisa estar em `CORS_ORIGINS`. Sem essa variável, ou com o MSW ligado, o chat usa `POST /api/chat/send`.
- Variáveis `NEXT_PUBLIC_*` são lidas quando o `next dev` inicia: reinicie-o depois de mudá-las.

## Testes

```bash
cd backend
docker compose up -d --wait
.venv/bin/python -m pytest -q
```

Os testes usam o banco `patchnotes_test` (recriado pelas migrations a cada execução, testando `downgrade` e `upgrade`), um LLM falso programável e um mailer falso. Cobrem autenticação (JWT, refresh com rotação e detecção de reuso, logout, recuperação de senha), validação, persistência, autorização entre usuários, limites de requisição, ausência de segredos nos logs, erros do LLM, streaming e desconexões no WebSocket, cliente Ollama (contra transporte HTTP simulado), métricas e saldo de tokens.

## Decisões e limitações

### Autenticação
- **Senhas:** Argon2id com sal aleatório por hash (`argon2-cffi`), calculado fora do event loop. Login com e-mail inexistente também calcula um hash, para não revelar contas pelo tempo de resposta.
- **Access token:** JWT HS256 em `Authorization: Bearer` (campo `token` do contrato). Validade de **24h** (`ACCESS_TOKEN_TTL_MINUTES=1440`) porque o frontend da Parte 1 ainda não renova tokens; reduzir para ~15 min quando ele usar `/auth/refresh`.
- **Refresh token:** valor aleatório de 256 bits em cookie **httpOnly, SameSite=Strict, path `/api/auth`** (`Secure` em produção); no banco só o SHA-256. Cada uso **rotaciona** o token; reapresentar um token já usado **revoga a família inteira** (sinal de roubo). `POST /api/auth/logout` revoga a família.
- **Redefinição de senha:** token aleatório de 256 bits, guardado como SHA-256, **uso único** (UPDATE condicional), validade de 30 min, e pedidos novos invalidam os anteriores. O link vai no **fragmento** (`/reset-password#token=…`), que navegadores não enviam a servidores nem gravam em logs de acesso. A redefinição revoga todos os refresh tokens e invalida access tokens emitidos antes (`users.tokens_valid_after`). `forgot-password` sempre responde 202 com a mesma mensagem e envia o e-mail depois da resposta.
- **WebSocket:** o token **não vai na URL**. O cliente envia `{"type":"auth","token":...}` como primeira mensagem (prazo de 5 s); o `Origin` precisa estar em `CORS_ORIGINS`. O token é revalidado a cada mensagem (expiração, senha redefinida ou conta removida encerram a conexão com 4401). Funciona em qualquer navegador, porque não depende de cabeçalhos customizados no handshake.

### Tokens do LLM e cota
- A contagem vem do Ollama (`prompt_eval_count` e `eval_count`). A mensagem do usuário guarda os tokens de prompt (inclui sistema e contexto) e a do assistente guarda os de resposta (`tokensUsed` do contrato). Se o modelo não informar, usa-se a estimativa **⌈caracteres / 4⌉** e o registro fica marcado `estimated=true`.
- `/dashboard/metrics.tokensUsed`, `/dashboard/token-usage` e o saldo somam prompt + resposta (tabela `token_usage`).
- **Cota mensal** (`MONTHLY_TOKEN_QUOTA`, padrão 100.000) por usuário, renovada no 1º dia do mês (UTC). Com saldo zerado o chat responde **429**. A checagem acontece antes de chamar o LLM; pedidos simultâneos no limite podem ultrapassá-lo em uma resposta (não há lock durante a geração, por regra).

### Métricas (como cada campo é calculado)
- `totalEntries`: entradas de devlog. `messagesExchanged`: mensagens concluídas (usuário + assistente).
- `streak`: dias consecutivos (UTC) com devlog ou mensagem enviada, terminando hoje ou ontem.
- `activeTime`: eventos (devlogs e mensagens enviadas) com até 30 min de intervalo formam uma sessão; cada sessão vale *(último − primeiro evento) + 5 min*.
- `activity-heatmap`: devlogs por dia, 90 dias até hoje (UTC). `entries-by-tag`: contagem por marcador, decrescente.

### Limites
- Corpo HTTP ≤ 64 KB (413); frame WebSocket ≤ 16 KB (fecha com 1009); mensagem de chat ≤ 2.000 caracteres; contexto ≤ 4.000.
- Limites de taxa **em memória, por processo**: login 20/min por IP e 10/5 min por e-mail; cadastro 10/h por IP; recuperação 5/15 min por IP e 3/15 min por e-mail; refresh 30/min; chat 20/min por usuário (REST + WS). Com vários workers ou réplicas, mova para Redis. Atrás de proxy confiável, use `TRUST_PROXY_HEADERS=true`.
- O histórico do chat devolve as 200 mensagens mais recentes (`CHAT_HISTORY_MAX`).

### Pendências conhecidas
- O frontend ainda **não** chama `/auth/refresh` nem `/auth/logout`, e não tem telas de "esqueci a senha"/redefinição. Isso exige mudanças no frontend, que dependem de aprovação.
- **Desempenho do Ollama do Fedora:** o pacote `ollama` do Fedora (0.12.x) vem compilado só com ROCm (AMD). Em GPUs NVIDIA o modelo roda na CPU: o primeiro token leva de ~1 s (prompt curto) a 20–30 s (com 10 mensagens de contexto). Confira com `curl -s localhost:11434/api/ps` (`size_vram: 0` significa CPU). Para usar a GPU NVIDIA é preciso uma build do Ollama com CUDA. Enquanto isso, reduzir `CHAT_CONTEXT_MESSAGES` encurta o prompt.
- O botão "Sair" do frontend só apaga o cookie local; o refresh token continua válido até expirar ou ser rotacionado.
