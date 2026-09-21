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
- Assistente com envio por `Enter`, quebra de linha com `Shift + Enter`, processamento e contagem de tokens.
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
- Teste automatizado para a função de saudação.

## O que será implementado

- Substituição da API simulada por um backend persistente.
- Banco de dados para usuários, perfis, métricas e entradas do devlog.
- Integração do assistente com um modelo de IA real.
- Persistência de mensagens, histórico de conversas e consumo de tokens.
- Edição e gerenciamento completo das entradas do devlog.
- Upload e armazenamento de imagens de perfil.
- Métricas e gráficos mais completos sobre a evolução do projeto.
- Maior cobertura de testes unitários, de integração e end-to-end.
- Validação visual em diferentes tamanhos de tela e navegadores.
- Configuração de ambiente, autenticação de produção e publicação da aplicação.

## Tecnologias

- [Next.js](https://nextjs.org/) 14, React 18 e TypeScript
- Tailwind CSS, shadcn/ui e Base UI
- TanStack React Query e Zustand
- React Hook Form e Zod
- Axios, Motion e MSW

## Como executar

### Pré-requisitos

- Node.js e npm instalados.

### Instalação e desenvolvimento

```bash
npm install
npm run dev
```

Depois, acesse [http://localhost:3000](http://localhost:3000).

### Outros comandos

```bash
npm run build          # gera a build de produção
npm start              # inicia a aplicação em produção
npm run test:greeting  # executa os testes da saudação
```

## Estrutura principal

```text
src/
├── app/                 # rotas e layouts do Next.js
├── components/          # componentes compartilhados da interface
├── lib/                 # clientes, utilitários e configurações
├── mocks/               # handlers e inicialização do MSW
├── modules/             # funcionalidades organizadas por domínio
├── providers/           # providers globais
└── store/               # estados globais com Zustand
```

## Status do projeto

O frontend navegável e os principais fluxos de uso já estão implementados com dados simulados. A próxima etapa é consolidar o backend, a persistência dos dados e a integração real do assistente.
