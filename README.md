# Control Finance

[![CI](https://github.com/JrValerio/Control-Finance-React-TailWind/actions/workflows/ci.yml/badge.svg)](https://github.com/JrValerio/Control-Finance-React-TailWind/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Aplicacao web para controle financeiro pessoal com entradas/saidas, filtros por categoria e periodo, grafico de receita x despesa, exportacao CSV e autenticacao JWT.

## Documentation Index

- [Links](#links)
- [Deploy](#deploy-render--vercel)
- [Operational Model](#operational-model)
- [Architecture (Monorepo Foundation)](#monorepo-v130-foundation)
- [Web Features](#funcionalidades-atuais-web)
- [Monthly Summary](#monthly-summary)
- [Monthly Budgets](#monthly-budgets)
- [CSV Import (Dry-run + Commit)](#csv-import-dry-run--commit)
- [Import History](#import-history)
- [Pagination](#pagination)
- [Export CSV (Architecture Doc)](docs/architecture/v1.5.0-export-csv.md)
- [API (apps/api)](#api-appsapi)
- [Auth (Architecture Doc)](docs/architecture/v1.3.0-auth.md)
- [Runbook](docs/runbooks/release-production-checklist.md)
- [Roadmap](#roadmap)

## Links

- Producao (Vercel): [control-finance-react-tail-wind.vercel.app](https://control-finance-react-tail-wind.vercel.app/)
- CI: [GitHub Actions - CI](https://github.com/JrValerio/Control-Finance-React-TailWind/actions/workflows/ci.yml)
- Releases: [GitHub Releases](https://github.com/JrValerio/Control-Finance-React-TailWind/releases)

## Deploy (Render + Vercel)

- Guia monorepo: `docs/deployment/monorepo-render-vercel.md`
- Production release checklist: `docs/runbooks/release-production-checklist.md`

## Operational Model

- Deploy trigger: merge na `main` (Render Auto Deploy) ou manual via **Deploy latest commit**.
- Health endpoint: `/health` retorna `{ ok, version, commit }`.
  - `version`: usa a versao de `apps/api/package.json`; fallback para `APP_VERSION` e depois `sha-<short>`.
  - `commit`: resolvido via `RENDER_GIT_COMMIT` (ou fallback) e representa exatamente o codigo em runtime.
- CI gates (web): `lint`, `typecheck`, `typecheck:auth`, `test`, `build`.
- Git tag/release: `vX.Y.Z`.
- Render `APP_VERSION`: opcional (`X.Y.Z`, sem `v`) para override/fallback.
- Runbook: `docs/runbooks/release-production-checklist.md`.

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
- Auth Hardening: `docs/architecture/v1.4.2-auth-hardening.md`
- Transactions CRUD+: `docs/architecture/v1.4.3-transactions-crud-plus.md`
- Export CSV: `docs/architecture/v1.5.0-export-csv.md`
- Web Pagination: `docs/architecture/v1.6.2-web-pagination.md`
- Pagination UI Polish: `docs/architecture/v1.6.3-pagination-polish.md`
- Health Build Identity: `docs/architecture/v1.6.4-health-build-identity.md`
- Health Version Fallback: `docs/architecture/v1.6.10-health-version-fallback.md`
- Web TypeScript Thin Slice: `docs/architecture/v1.6.5-web-typescript-thin-slice.md`
- Web TypeScript Services + Routes: `docs/architecture/v1.6.6-web-typescript-services-and-routes.md`

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
- Protecao de login com rate limiting e bloqueio temporario por `IP+email`
- Edicao de transacao com descricao e observacoes
- Exclusao com confirmacao e desfazer (undo real)
- Exportacao CSV com filtros ativos (categoria + periodo) e totais consolidados
- Listagem paginada com `Anterior/Proxima` e indicador de pagina
- Faixa de pagina (`Mostrando X-Y de N`) e seletor de itens por pagina
- Base TypeScript inicial no `apps/web` com service de transacoes tipado
- Camada `api` e entrypoints de rotas/web migrados para TypeScript

### Monthly Summary

- Endpoint: `GET /transactions/summary?month=YYYY-MM`
- Retorna `income`, `expense`, `balance` e `byCategory`
- Dashboard usa o summary da API para os cards mensais

## Monthly Budgets

- `POST /budgets` cria ou atualiza meta por `categoryId + month`
- `GET /budgets?month=YYYY-MM` retorna `budget`, `actual`, `remaining`, `percentage` e `status`
- `DELETE /budgets/:id` remove meta do usuario autenticado
- Regras de status:
  - `ok` quando `percentage < 80`
  - `near_limit` quando `percentage >= 80` e `<= 100`
  - `exceeded` quando `percentage > 100`

## CSV Import (Dry-run + Commit)

### CSV import flow

A importacao CSV usa um fluxo seguro em duas etapas:

1. Upload do arquivo
2. Pre-visualizacao e validacao (`dry-run`)
3. Commit somente das linhas validas

Isso evita persistir dados invalidos no banco.

### Formato aceito

```csv
date,type,value,description,notes,category
2026-03-01,Entrada,1000,Salario,,Trabalho
2026-03-02,Saida,250,Supermercado,Compras do mes,Mercado
```

| Column        | Required | Description                                    |
| ------------- | -------- | ---------------------------------------------- |
| `date`        | Yes      | Formato `YYYY-MM-DD`                           |
| `type`        | Yes      | `Entrada` ou `Saida` (case-insensitive)        |
| `value`       | Yes      | Numero `> 0` (suporta `.` e `,`)               |
| `description` | Yes      | Texto nao vazio                                |
| `notes`       | No       | Opcional                                       |
| `category`    | No       | Deve existir para o usuario (case-insensitive) |

### Validacao por linha

Quando uma linha e invalida, a resposta traz erros por campo:

```json
{
  "line": 3,
  "status": "invalid",
  "errors": [
    { "field": "date", "message": "Data invalida. Use YYYY-MM-DD." }
  ]
}
```

### Segurança e consistência

- Sessao de dry-run com TTL de 30 minutos
- Commit em uma unica transacao de banco
- Commit idempotente (sessao ja confirmada retorna `409`)
- Sessao expirada retorna `410`
- Erros padronizados no formato `{ message }`
- Status de erro: `400` (input invalido), `404` (sessao nao encontrada/sem ownership), `409` (ja confirmada), `410` (expirada)

### API reference (resumo)

- `POST /transactions/import/dry-run`
  - `multipart/form-data` com campo `file`
  - resposta com `importId`, `expiresAt`, `summary` e `rows`
- `POST /transactions/import/commit`
  - `application/json` com `{ importId }`

```json
{
  "importId": "uuid"
}
```

## Import History

- Endpoint: `GET /transactions/imports?limit=20&offset=0`
- Retorna sessoes de importacao do usuario autenticado em ordem `createdAt DESC`
- Campos por item: `id`, `createdAt`, `expiresAt`, `committedAt`, `summary`
- Regra de `summary.imported`: `committedAt ? validRows : 0`

### Status no Web

- `Committed`: possui `committedAt`
- `Expired`: nao possui `committedAt` e `Date.now() > Date.parse(expiresAt)`
- `Pending`: nao possui `committedAt` e nao expirou

## Pagination

The transactions list supports server-side pagination using `limit` and `offset`.

Example:

```http
GET /transactions?limit=20&offset=40
```

Notes:

- `offset` takes precedence over `page`
- The dashboard persists pagination and filters in the querystring
- URLs are shareable and refresh-safe
- Pagination metadata is returned in `meta`:

```json
{
  "meta": {
    "page": 3,
    "limit": 20,
    "offset": 40,
    "total": 95,
    "totalPages": 5
  }
}
```

## API (apps/api)

- `GET /health` retorna `{ ok: true, version, commit }`
  - `version`: `apps/api/package.json` por padrao, com fallback opcional `APP_VERSION` e depois `sha-<commit-curto>`
  - `commit`: prioriza `RENDER_GIT_COMMIT`, com fallback para `APP_COMMIT`/`COMMIT_SHA`
- `POST /auth/register` cria usuario no Postgres
- `POST /auth/login` retorna `{ token, user }`
- `/auth/login` aplica rate limit por IP e bloqueio temporario por brute force
- `GET /categories` lista categorias ativas do usuario autenticado (`?includeDeleted=true` inclui removidas por soft delete)
- `POST /categories` cria categoria (`name`) com unicidade por usuario (case/acento-insensitive)
- `PATCH /categories/:id` renomeia categoria ativa do usuario autenticado
- `DELETE /categories/:id` aplica soft delete em categoria ativa do usuario autenticado
- `POST /categories/:id/restore` restaura categoria removida (retorna `409` em conflito de nome ativo)
- Manutencao: `npm -w apps/api run db:backfill:categories-normalized` para alinhar `normalized_name` legado com a normalizacao atual da API
- Metas mensais: veja [Monthly Budgets](#monthly-budgets)
- `GET /transactions` lista transacoes do usuario autenticado com filtros opcionais (`type`, `from`, `to`, `q`, `includeDeleted`, `page`, `limit`, `offset`)
  - defaults: `limit=20`, `offset=0`
  - validacao: `limit` inteiro entre `1` e `100`; `offset` inteiro `>= 0`
  - Pagination precedence: when `offset` is provided, it takes precedence over `page`.
  - Paginated response shape: `{ data, meta: { page, limit, offset, total, totalPages } }`
- `POST /transactions` cria transacao para o usuario autenticado
- `PATCH /transactions/:id` atualiza transacao do usuario autenticado
- `DELETE /transactions/:id` aplica soft delete para o usuario autenticado
- `POST /transactions/:id/restore` restaura transacao removida
- `GET /transactions/export.csv` exporta CSV filtrado com totais de entradas, saidas e saldo
- `POST /transactions/import/dry-run` valida CSV por linha e cria sessao de importacao com TTL
- `POST /transactions/import/commit` confirma sessao de importacao e persiste apenas linhas validas
- `GET /transactions/imports` lista historico de sessoes de importacao por usuario com `limit`/`offset`
- `GET /transactions/imports/metrics` retorna metricas por usuario (`total`, `last30Days`, `lastImportAt`)
- Correlacao de request: aceita `x-request-id` (ou `x-correlation-id`) e ecoa `x-request-id` na resposta
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
- Em deploy com proxy (Render), use `TRUST_PROXY=1` na API
- `CORS_ORIGIN` da API pode receber lista separada por virgula (local + dominios de deploy)
- Hardening de login: `AUTH_RATE_LIMIT_*` e `AUTH_BRUTE_FORCE_*`
- Build identity da API no healthcheck: versao do `apps/api/package.json` e commit automatico via `RENDER_GIT_COMMIT`

## Scripts (root)

- `npm run dev` inicia `apps/web` e `apps/api`
- `npm run lint` roda lint nos dois apps
- `npm run typecheck` valida tipos no `apps/web`
- `npm run test` roda testes dos dois apps
- `npm run build` builda web e valida build da api
- `npm run preview` sobe preview do web

## Scripts (api)

- `npm -w apps/api run db:migrate` aplica migrations do Postgres
- `npm -w apps/api run db:seed` executa seed minima (usuario demo + transacoes)
- `npm -w apps/web run typecheck` valida tipos do frontend

## Qualidade

- CI com jobs separados para web e api em `.github/workflows/ci.yml`
- Branch protection habilitada na `main`
- Runtime padronizado em Node `24.x`

## Roadmap

- [x] PR 2 (v1.3.0): autenticacao JWT + rotas protegidas
- [x] PR 3 (v1.3.0): transacoes por usuario no backend + frontend API-first
- [x] Persistencia em banco remoto (Postgres) para ambiente de producao
- [x] Exportacao CSV com filtros e totais
- [x] Importacao CSV com dry-run + commit
- [x] Historico de importacoes (API + Web)
- [ ] Importacao JSON

## Licenca

MIT. Consulte `LICENSE`.
