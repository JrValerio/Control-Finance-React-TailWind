import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import {
  CATEGORY_ENTRY,
  CATEGORY_EXIT,
} from "../components/DatabaseUtils";

const STORAGE_KEY = "transactions";

const saveTransactions = (transactions) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
};

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("adiciona transacao e persiste no localStorage", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Registrar novo valor" }),
    );
    await user.type(screen.getByLabelText("Valor"), "100,50");
    await user.click(screen.getByRole("button", { name: "Inserir valor" }));

    expect(await screen.findAllByText("R$ 100.50")).toHaveLength(2);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual([
      {
        id: 1,
        value: 100.5,
        type: CATEGORY_ENTRY,
      },
    ]);
  });

  it("carrega transacoes salvas ao iniciar", () => {
    saveTransactions([{ id: 1, value: 45, type: CATEGORY_ENTRY }]);

    render(<App />);

    expect(screen.getAllByText("R$ 45.00")).toHaveLength(2);
  });

  it("filtra por categoria", async () => {
    const user = userEvent.setup();
    saveTransactions([
      { id: 1, value: 100, type: CATEGORY_ENTRY },
      { id: 2, value: 40, type: CATEGORY_EXIT },
    ]);

    render(<App />);

    await user.click(screen.getByRole("button", { name: CATEGORY_EXIT }));

    expect(screen.getByText("R$ 40.00")).toBeInTheDocument();
    expect(screen.queryByText("R$ 100.00")).not.toBeInTheDocument();
    expect(screen.getByText("R$ -40.00")).toBeInTheDocument();
  });

  it("remove transacao e atualiza persistencia", async () => {
    const user = userEvent.setup();
    saveTransactions([{ id: 1, value: 30, type: CATEGORY_ENTRY }]);

    render(<App />);

    await user.click(screen.getByRole("button", { name: /Excluir transacao 1/i }));

    expect(await screen.findByText("Nenhum valor cadastrado.")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual([]);
  });
});
