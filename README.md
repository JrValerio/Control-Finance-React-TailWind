# Control Finance

[![CI](https://github.com/JrValerio/Control-Finance-React-TailWind/actions/workflows/ci.yml/badge.svg)](https://github.com/JrValerio/Control-Finance-React-TailWind/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Aplicacao web para controle financeiro pessoal com entradas/saidas, filtros por categoria e periodo, grafico de receita x despesa e autenticacao JWT.

## Links

- Producao (Vercel): [control-finance-react-tail-wind.vercel.app](https://control-finance-react-tail-wind.vercel.app/)
- CI: [GitHub Actions - CI](https://github.com/JrValerio/Control-Finance-React-TailWind/actions/workflows/ci.yml)
- Releases: [GitHub Releases](https://github.com/JrValerio/Control-Finance-React-TailWind/releases)

## Preview

![Tela principal](docs/images/home.png)
![Modal de cadastro](docs/images/modal.png)

## Monorepo (v1.3.0 Foundation)

```text
apps/
  web/ -> Frontend React + Vite
  api/ -> Backend Express (healthcheck + base para auth/transactions)
```

Detalhes tecnicos:
- Foundation: `docs/architecture/v1.3.0.md`
- Auth: `docs/architecture/v1.3.0-auth.md`
- Transactions API: `docs/architecture/v1.3.1-transactions.md`
- Postgres Persistence: `docs/architecture/v1.4.0-postgres.md`

## Funcionalidades atuais (web)

- Cadastro de transacoes com tipo (`Entrada` e `Saida`) e data
- Filtro por categoria: `Todos`, `Entrada`, `Saida`
- Filtro por periodo: `Todo periodo`, `Hoje`, `Ultimos 7 dias`, `Ultimos 30 dias`, `Personalizado`
- Saldo e totais por tipo em tempo real
- Grafico de receita x despesa (Recharts, lazy-loaded)
- Transacoes carregadas e persistidas pela API (por usuario autenticado)
- Modal com fechamento por `ESC` e clique no backdrop
- Remocao de transacoes
- Login e criacao de conta com JWT
- Sessao JWT com token em `localStorage` (chave namespaced)
- Logout e rota protegida para `/app`

## API (apps/api)

- `GET /health` retorna `{ ok: true, version }` com a versao atual do `apps/api/package.json`
- `POST /auth/register` cria usuario no Postgres
- `POST /auth/login` retorna `{ token, user }`
- `GET /transactions` lista transacoes do usuario autenticado
- `POST /transactions` cria transacao para o usuario autenticado
- `DELETE /transactions/:id` remove transacao do usuario autenticado
- Migrations SQL automaticas no startup (`src/db/migrations`)
- Middleware global de erro e fallback `404`

## Como rodar localmente

1. Instalar dependencias:

```bash
npm ci
```

2. Subir web + api juntos:

```bash
npm run dev
```

3. Endpoints locais:

- Web: `http://localhost:5173`
- API: `http://localhost:3001/health`

## Variaveis de ambiente

- Referencia geral: `.env.example`
- Web: `apps/web/.env.example`
- API: `apps/api/.env.example`
- Em deploy (Vercel), `VITE_API_URL` e obrigatoria e deve apontar para a URL publica da API
- Para Postgres gerenciado com SSL, configure `DB_SSL=true` na API
- `CORS_ORIGIN` da API pode receber lista separada por virgula (local + dominios de deploy)

## Scripts (root)

- `npm run dev` inicia `apps/web` e `apps/api`
- `npm run lint` roda lint nos dois apps
- `npm run test` roda testes dos dois apps
- `npm run build` builda web e valida build da api
- `npm run preview` sobe preview do web

## Scripts (api)

- `npm -w apps/api run db:migrate` aplica migrations do Postgres
- `npm -w apps/api run db:seed` executa seed minima (usuario demo + transacoes)

## Qualidade

- CI com jobs separados para web e api em `.github/workflows/ci.yml`
- Branch protection habilitada na `main`
- Runtime padronizado em Node `24.x`

## Roadmap

- [x] PR 2 (v1.3.0): autenticacao JWT + rotas protegidas
- [x] PR 3 (v1.3.0): transacoes por usuario no backend + frontend API-first
- [x] Persistencia em banco remoto (Postgres) para ambiente de producao
- [ ] Exportacao/importacao CSV e JSON

## Licenca

MIT. Consulte `LICENSE`.
