# Patchnotes

O Patchnotes é uma aplicação web para organizar e acompanhar o desenvolvimento de jogos. A proposta é reunir, em um único espaço, o progresso do projeto, anotações de desenvolvimento, métricas de uso e um assistente para apoiar a criação e validação de mecânicas.

O projeto está sendo desenvolvido com Next.js e possui uma API simulada para permitir a evolução da interface antes da integração com o backend definitivo.

## O que já foi feito

### Autenticação e acesso

- Login e cadastro com validação.
- Proteção das rotas autenticadas e redirecionamentos.
- Controle de sessão com token e tratamento de sessão expirada.

### Funcionalidades principais

- Dashboard com métricas de entradas, tokens, tempo ativo e mensagens.
- Saudação personalizada de acordo com horário e usuário.
- Devlog com listagem, criação de entradas, marcadores, validação e feedback.
- Assistente com envio por `Enter`, quebra de linha com `Shift + Enter`, processamento, contagem de tokens e resposta em streaming (WebSocket) quando ligado ao backend real.
- Perfil com edição de nome, biografia, avatar e GitHub.
- Estados de carregamento, erro, nova tentativa e estado vazio nas telas.

### Interface e experiência

- Tema escuro com identidade visual inspirada em ferramentas de desenvolvimento e HUDs de jogos.
- Sidebar expansível e compacta, com tooltips e estado preservado durante a navegação.
- Layout responsivo para desktop e telas menores.
- Componentes reutilizáveis de formulário, cards, botões, badges, feedback e cabeçalhos.
- Microinterações com suporte a `prefers-reduced-motion`.
- Labels, foco, mensagens de erro e estados de interface tratados com atenção à acessibilidade.

### Base técnica

- Organização por módulos: `auth`, `dashboard`, `devlog`, `chat` e `profile`.
- React Query para consultas e mutações e Zustand para estado global.
- React Hook Form e Zod para formulários e validações.
- Axios para comunicação com a API.
- Mock Service Worker (MSW) com endpoints simulados de autenticação, dashboard, devlog, chat e perfil.
- Contratos da API documentados em [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md), fonte única para o backend da próxima etapa.
- Cenários simulados reproduzíveis de sucesso, vazio, payload inválido (400), sessão expirada (401) e erro de servidor (500).
- Testes automatizados para a função de saudação e para os handlers/contratos do MSW.

### Backend (Parte 2)

- API em FastAPI com PostgreSQL, migrations Alembic e validação Pydantic, implementando os mesmos contratos da Parte 1.
- Autenticação com JWT, refresh token rotacionado em cookie httpOnly, recuperação de senha por e-mail e atualização de perfil.
- Chat com LLM local (Ollama) via REST e via WebSocket `/ws/chat` com streaming token a token; mensagens e consumo de tokens persistidos.
- Métricas do dashboard, histórico de consumo e saldo mensal de tokens.
- Detalhes em [`backend/README.md`](backend/README.md).

## O que será implementado

- Uso do refresh token e da recuperação de senha pelas telas do frontend.
- Edição e gerenciamento completo das entradas do devlog.
- Upload e armazenamento de imagens de perfil.
- Maior cobertura de testes end-to-end.
- Configuração de ambiente de produção e publicação da aplicação.

## Tecnologias

- [Next.js](https://nextjs.org/) 14, React 18 e TypeScript
- Tailwind CSS, shadcn/ui e Base UI
- TanStack React Query e Zustand
- React Hook Form e Zod
- Axios, Motion e MSW
- Backend: Python, FastAPI, SQLAlchemy (async), PostgreSQL, Alembic, Pydantic e Ollama

## Como executar

### Pré-requisitos

- Node.js e npm instalados.

### Instalação e desenvolvimento

```bash
npm install
npm run dev
```

Depois, acesse [http://localhost:3000](http://localhost:3000) e entre com `hayverson@patchnotes.dev` / `patchnotes123` ou crie uma conta.

### API simulada (MSW)

Em desenvolvimento (`npm run dev`), o app só exibe as telas depois que o Mock Service Worker confirma que está interceptando as requisições. Se o worker não iniciar (por exemplo, sem `public/mockServiceWorker.js` ou com service workers bloqueados), aparece a tela "A API simulada não iniciou" com o motivo e o botão **Tentar novamente**; nenhuma chamada é feita sem mock. Para recriar o worker: `npx msw init public`.

Os dados simulados ficam na memória da aba e são reiniciados ao recarregar a página.

Para usar o backend real em vez do MSW, suba a API (veja [`backend/README.md`](backend/README.md)) e rode:

```bash
API_URL=http://127.0.0.1:8000 NEXT_PUBLIC_API_MOCKING=disabled NEXT_PUBLIC_CHAT_WS_URL=ws://127.0.0.1:8000/ws/chat npm run dev
```

Com `NEXT_PUBLIC_CHAT_WS_URL`, o assistente mostra a resposta token a token via WebSocket. Sem ela, ou com o MSW, o chat usa a rota REST.

Para ver estados de erro e vazio, abra qualquer página com o parâmetro `mock`:

```text
/dashboard?mock=empty                       # todas as telas sem dados
/dashboard?mock=dashboard:server-error      # erro 500 só no dashboard
/chat?mock=chat:server-error                # histórico com erro e envio falhando
/profile?mock=profile:invalid-payload       # salvar perfil retorna 400
/dashboard?mock=dashboard:unauthorized      # 401: sessão encerrada e volta ao login
```

Um aviso no topo indica o cenário ativo e permite limpá-lo. Detalhes em [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md#cenários-simulados-somente-msw-desenvolvimento).

### Outros comandos

```bash
npm run build          # gera a build de produção
npm start              # inicia a aplicação em produção
npm run test:greeting  # executa os testes da saudação
npm run test:mocks     # testa handlers e contratos do MSW (requer Bun)
```

## Estrutura principal

```text
backend/                 # API FastAPI + PostgreSQL + Ollama (ver backend/README.md)
docs/
└── API_CONTRACTS.md     # contratos HTTP (endpoints, payloads, erros)
src/
├── app/                 # rotas e layouts do Next.js
├── components/          # componentes compartilhados da interface
├── lib/                 # clientes, utilitários e configurações
├── mocks/               # handlers, cenários simulados e inicialização do MSW
├── modules/             # funcionalidades organizadas por domínio
├── providers/           # providers globais
└── store/               # estados globais com Zustand
```

## Status do projeto

O frontend funciona tanto com a API simulada (MSW) quanto com o backend real, com persistência em PostgreSQL e assistente via Ollama local. A próxima etapa é usar no frontend os recursos restantes do backend (refresh de sessão e recuperação de senha).
