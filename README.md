# Control Finance

[![CI](https://github.com/JrValerio/Control-Finance-React-TailWind/actions/workflows/ci.yml/badge.svg)](https://github.com/JrValerio/Control-Finance-React-TailWind/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Aplicacao web para controle financeiro pessoal (entradas e saidas), com filtro por categoria, saldo em tempo real e persistencia via `localStorage`.

## Links

- Producao (Vercel): [control-finance-react-tail-wind.vercel.app](https://control-finance-react-tail-wind.vercel.app/)
- CI: [GitHub Actions - CI](https://github.com/JrValerio/Control-Finance-React-TailWind/actions/workflows/ci.yml)

## Preview

![Tela principal](docs/images/home.png)
![Modal de cadastro](docs/images/modal.png)

## Funcionalidades

- Cadastro de transacoes do tipo `Entrada` e `Saida`
- Filtro por categoria: `Todos`, `Entrada`, `Saida`
- Calculo de saldo com base no filtro ativo
- Persistencia local com `localStorage`
- Modal com fechamento por `ESC` e clique no backdrop
- Remocao de transacoes

## Arquitetura

- `src/pages/App.jsx`
  - Estado principal de transacoes
  - Persistencia no `localStorage`
  - Regras de filtro e saldo
  - Estados de tela vazia
- `src/components/Modal.jsx`
  - Captura e validacao de entrada
  - Seleciona tipo de transacao
  - Emite `onSave({ value, type })`
- `src/components/DatabaseUtils.jsx`
  - `filterByCategory`
  - `calculateBalance`
  - `parseCurrencyInput`

## Decisoes tecnicas

- Fonte unica de verdade para transacoes no `App`
- Estado derivado calculado com `useMemo` (filtro e saldo)
- Modal desacoplado da persistencia para evitar estado duplicado
- Runtime fixado em Node `24.x` (`engines` + `.nvmrc`)

## Qualidade

- Lint: `npm run lint`
- Testes: `npm run test:run`
- Build: `npm run build`
- Auditoria de seguranca: `npm audit`

Este repositorio executa CI no GitHub Actions (`.github/workflows/ci.yml`) com validacao de lint, testes e build em todo PR para `main`.

## Como rodar localmente

```bash
npm ci
npm run dev
```

Build e preview:

```bash
npm run build
npm run preview
```

## Scripts

- `npm run dev` inicia ambiente de desenvolvimento
- `npm run lint` executa verificacoes de qualidade
- `npm run test` executa testes em modo watch
- `npm run test:run` executa testes uma vez (CI)
- `npm run build` gera build de producao
- `npm run preview` serve build local

## Contribuindo

1. Crie uma branch a partir da `main`
2. Rode `npm run lint`, `npm run test:run` e `npm run build`
3. Abra um PR com objetivo, escopo e passos de validacao
4. Aguarde os checks obrigatorios e review

Templates de PR e Issue estao em `.github/pull_request_template.md` e `.github/ISSUE_TEMPLATE/bug_report.md`.

## Roadmap

- [ ] Categorias personalizadas (alimentacao, transporte etc.)
- [ ] Data da transacao e filtro por periodo
- [ ] Exportar e importar dados (CSV e JSON)
- [ ] Persistencia em backend com autenticacao
- [ ] Dashboard com graficos de receita x despesa

## Licenca

MIT. Consulte `LICENSE`.
