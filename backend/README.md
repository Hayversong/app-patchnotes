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

# 3. PostgreSQL + Redis + Mailpit (portas presas a 127.0.0.1)
docker compose up -d --wait
# Na primeira subida, docker/postgres-init cria também o banco de testes patchnotes_test.

# 4. Migrations
.venv/bin/alembic upgrade head

# 5. (opcional) Conta fictícia: dev@patchnotes.dev / patchnotes123
.venv/bin/python -m app.scripts.seed

# 6. API (use este comando, não o uvicorn direto — ver "Proxy e IP do cliente")
.venv/bin/python -m app            # API_HOST, API_PORT e API_WORKERS opcionais
```

### Manutenção agendada

`python -m app.scripts.cleanup` apaga refresh tokens vencidos, tokens de redefinição vencidos ou usados e marca como falha os pedidos de chat que ficaram `pending` (processo encerrado no meio da geração). Trabalha em lotes de 1.000 linhas, cada um numa transação curta, e usa um advisory lock do PostgreSQL: agendar em todas as réplicas é seguro, só uma faz o trabalho. Exemplo com timer do systemd (a cada hora):

```ini
# /etc/systemd/system/patchnotes-cleanup.service
[Service]
Type=oneshot
WorkingDirectory=/srv/patchnotes/backend
EnvironmentFile=/srv/patchnotes/backend/.env
ExecStart=/srv/patchnotes/backend/.venv/bin/python -m app.scripts.cleanup

# /etc/systemd/system/patchnotes-cleanup.timer
[Timer]
OnCalendar=hourly
RandomizedDelaySec=300
[Install]
WantedBy=timers.target
```

Documentação interativa (fora de produção): http://127.0.0.1:8000/api/docs. E-mails de desenvolvimento: http://localhost:8025.

### Ollama

```bash
# Instalador oficial: inclui as bibliotecas CUDA (NVIDIA) e cria /etc/systemd/system/ollama.service.
# Leia o script antes de rodar. Se o driver NVIDIA já estiver instalado (nvidia-smi funciona), ele não mexe no driver.
curl -fsSL -o install.sh https://ollama.com/install.sh && sh install.sh
ollama pull qwen2.5:3b               # ~1,9 GB; cabe numa GPU de 4 GB
curl -s localhost:11434/api/ps       # com o modelo carregado, size_vram == size significa 100% na GPU
```

> **Fedora:** o pacote `ollama` do repositório do Fedora vem compilado **só com CPU/ROCm (AMD)**. Em GPU NVIDIA ele roda na CPU. Use o instalador oficial acima: ele instala em `/usr/local` e o serviço em `/etc/systemd/system` tem prioridade sobre o do pacote. Os modelos continuam em `/var/lib/ollama`.

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

Os testes usam o banco `patchnotes_test` (recriado pelas migrations a cada execução, testando `downgrade` e `upgrade`), um LLM falso programável e um mailer falso. Com `TEST_REDIS_URL` (banco 15 do Redis do compose), também testam os limites compartilhados entre réplicas; sem ele, esses testes são pulados (na CI são obrigatórios). Cobrem autenticação (JWT, refresh com rotação e detecção de reuso, logout, recuperação de senha), validação, persistência, autorização entre usuários, limites de requisição, ausência de segredos nos logs, erros do LLM, streaming e desconexões no WebSocket, cliente Ollama (contra transporte HTTP simulado), métricas e saldo de tokens.

## Decisões e limitações

### Autenticação
- **Senhas:** Argon2id com sal aleatório por hash (`argon2-cffi`), calculado fora do event loop. Login com e-mail inexistente também calcula um hash, para não revelar contas pelo tempo de resposta.
- **Access token:** JWT HS256 em `Authorization: Bearer` (campo `token` do contrato). Validade de **15 min** (`ACCESS_TOKEN_TTL_MINUTES=15`); o frontend renova sozinho com `/auth/refresh` ao receber 401 (também no WebSocket, ao ser recusado com 4401).
- **Refresh token:** valor aleatório de 256 bits em cookie **httpOnly, SameSite=Strict, path `/api/auth`** (`Secure` em produção); no banco só o SHA-256. Cada uso **rotaciona** o token; reapresentar um token já usado **revoga a família inteira** (sinal de roubo). `POST /api/auth/logout` revoga a família.
- **Redefinição de senha:** token aleatório de 256 bits, guardado como SHA-256, **uso único** (UPDATE condicional), validade de 30 min, e pedidos novos invalidam os anteriores. O link vai no **fragmento** (`/reset-password#token=…`), que navegadores não enviam a servidores nem gravam em logs de acesso. A redefinição revoga todos os refresh tokens e incrementa `users.session_version`: o JWT carrega essa versão (claim `sv`) e tokens com versão antiga são recusados na hora, sem janela de tempo. `forgot-password` sempre responde 202 com a mesma mensagem; a consulta, a gravação do token e o e-mail acontecem **depois** da resposta, pelo mesmo caminho para qualquer e-mail (o tempo de resposta não revela a conta).
- **Perfil × senha:** `PATCH /profile` grava só as colunas de perfil (`UPDATE … RETURNING`); nunca regrava senha nem versão de sessão, então não desfaz uma redefinição concorrente.
- **WebSocket:** o token **não vai na URL**. O cliente envia `{"type":"auth","token":...}` como primeira mensagem (prazo de 5 s); o `Origin` precisa estar em `CORS_ORIGINS`. O token é revalidado a cada mensagem (expiração, senha redefinida ou conta removida encerram a conexão com 4401) e a conexão também fecha com 4401 quando ele expira, mesmo sem mensagens. Funciona em qualquer navegador, porque não depende de cabeçalhos customizados no handshake.
- **Conexões WebSocket:** até `WS_MAX_CONNECTIONS_PER_USER` (3) por conta e `WS_MAX_CONNECTIONS_PER_IP` (20) por IP, contando as ainda não autenticadas (recusadas no handshake). Fecha com 4408 após `WS_IDLE_TIMEOUT_SECONDS` (600) sem mensagens. As vagas ficam no Redis com validade de `WS_SLOT_TTL_SECONDS`, renovada por heartbeat: se um processo morrer, as vagas dele expiram sozinhas.

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
- **Limites de taxa** (janela deslizante): login 20/min por IP; **falhas** de login 10/5 min por (e-mail, IP) e 100/h por e-mail; cadastro 10/h por IP; recuperação 5/15 min por IP, 3/15 min por (e-mail, IP) e 10/h por e-mail; redefinição 10/15 min por IP; refresh 30/min por IP; chat 20/min por usuário (REST + WS); devlog 30 criações/min e perfil 20 alterações/min por usuário. E-mails entram nas chaves só como SHA-256.
- **Onde ficam:** com `REDIS_URL`, no Redis, compartilhados entre processos e réplicas (scripts Lua atômicos, relógio do Redis, TTL por chave). **Obrigatório em production.** Sem ele (desenvolvimento), na memória do processo, com limpeza incremental. Se o Redis cair, os limites **falham fechados**: 503 em vez de seguir sem limite.
- **Proxy e IP do cliente:** o IP vem da conexão TCP. O `X-Forwarded-For` só é lido se a conexão vier de um endereço listado em `TRUSTED_PROXIES` (IPs ou CIDR), e é percorrido da direita para a esquerda até o primeiro endereço não confiável; valores forjados à esquerda são ignorados. **Inicie com `python -m app`**: o uvicorn, por padrão, confia no `X-Forwarded-For` de qualquer conexão vinda de 127.0.0.1 e reescreve o IP antes da aplicação ver a conexão. Atrás do rewrite do Next.js (que repassa o cabeçalho do cliente sem alterar), isso deixava qualquer pessoa escolher o próprio IP. **Não liste o servidor Next.js em `TRUSTED_PROXIES`.** Em produção, coloque um proxy reverso (nginx, Caddy) que encaminhe `/api` e `/ws` direto à API e **sobrescreva** o `X-Forwarded-For` (nginx: `proxy_set_header X-Forwarded-For $remote_addr;`), e liste o IP dele. Em desenvolvimento, pelo rewrite do Next, todos os navegadores aparecem como 127.0.0.1 e dividem os limites por IP.
- `GET /devlog/entries` é paginado (`?limit=` até 100 e `?cursor=`); sem parâmetros, devolve as 100 entradas mais recentes.
- O histórico do chat devolve as 200 mensagens mais recentes (`CHAT_HISTORY_MAX`).

### Pendências conhecidas
- **Desempenho medido** (12/11/2026, RTX 3050 Laptop de 4 GB, `qwen2.5:3b` Q4_K_M, Ollama oficial 0.40 com CUDA): modelo 100% na GPU usando ~2,1 GB de VRAM; ~75 tokens/s; carga a frio ~3 s (a primeiríssima carga após instalar levou ~50 s). Pelo WebSocket, o 1º token chega em ~0,1 s com o modelo carregado. Antes, com o pacote do Fedora só em CPU: 1º token em ~7,6 s e ~6 tokens/s.
- **Contexto do modelo reduzido para GPUs de 4 GB:** `OLLAMA_NUM_CTX=2048` e `CHAT_CONTEXT_MESSAGES=6`. Sobram ~1.500 tokens para sistema, contexto, histórico e mensagem (a resposta usa até 512). Se o prompt passar disso, o Ollama descarta o começo sem avisar. Para economizar mais VRAM numa build com CUDA, inicie o serviço do Ollama com `OLLAMA_FLASH_ATTENTION=1` e `OLLAMA_KV_CACHE_TYPE=q8_0`.
- O logout do frontend revoga a sessão no servidor em segundo plano; se essa chamada falhar (rede), a sessão local é apagada mesmo assim e o refresh token só expira no prazo.
