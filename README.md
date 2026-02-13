# Control Finance

Aplicacao web para controle financeiro pessoal com React, Vite e Tailwind CSS.

## Funcionalidades

- Cadastro de transacoes de entrada e saida.
- Filtro por categoria (`Todos`, `Entrada`, `Saida`).
- Calculo de saldo com base no filtro ativo.
- Persistencia local via `localStorage`.

## Stack

- React 18
- Vite 7
- Tailwind CSS 3
- Vitest + Testing Library
- ESLint

## Como rodar

```bash
npm ci
npm run dev
```

## Scripts

- `npm run dev`: inicia ambiente de desenvolvimento.
- `npm run build`: gera build de producao.
- `npm run preview`: sobe build local para validacao.
- `npm run lint`: valida regras de qualidade.
- `npm run test`: executa testes em modo watch.
- `npm run test:run`: executa testes uma vez (CI).

## Qualidade

Este projeto possui pipeline de CI em `.github/workflows/ci.yml` executando:

1. `npm run lint`
2. `npm run build`
3. `npm run test:run`

## Licenca

Projeto sob licenca MIT.
