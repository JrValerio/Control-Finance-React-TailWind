import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import {
  CATEGORY_ENTRY,
  CATEGORY_EXIT,
  getTodayISODate,
} from "../components/DatabaseUtils";

vi.mock("../components/TransactionChart", () => ({
  default: () => <div data-testid="transaction-chart" />,
}));

const STORAGE_KEY = "transactions";

const saveTransactions = (transactions) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
};

const getDateWithOffset = (offsetDays) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("adiciona transacao com data e persiste no localStorage", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Registrar novo valor" }),
    );
    await user.type(screen.getByLabelText("Valor"), "100,50");
    fireEvent.change(screen.getByLabelText("Data"), {
      target: { value: "2026-02-13" },
    });
    await user.click(screen.getByRole("button", { name: "Inserir valor" }));

    expect(await screen.findAllByText("R$ 100.50")).toHaveLength(3);
    expect(screen.getByText("13/02/2026")).toBeInTheDocument();

    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual([
      {
        id: 1,
        value: 100.5,
        type: CATEGORY_ENTRY,
        date: "2026-02-13",
      },
    ]);
  });

  it("carrega transacoes legadas sem data", () => {
    saveTransactions([{ id: 1, value: 45, type: CATEGORY_ENTRY }]);

    render(<App />);

    expect(screen.getAllByText("R$ 45.00")).toHaveLength(3);
  });

  it("filtra por categoria e periodo", async () => {
    const user = userEvent.setup();
    const today = getTodayISODate();
    const oldDate = getDateWithOffset(-20);

    saveTransactions([
      { id: 1, value: 100, type: CATEGORY_ENTRY, date: today },
      { id: 2, value: 40, type: CATEGORY_EXIT, date: today },
      { id: 3, value: 30, type: CATEGORY_ENTRY, date: oldDate },
    ]);

    render(<App />);

    await user.selectOptions(screen.getByLabelText("Periodo"), "Hoje");
    await user.click(screen.getByRole("button", { name: CATEGORY_EXIT }));

    expect(screen.getAllByText("R$ 40.00")).toHaveLength(2);
    expect(screen.queryByText("R$ 30.00")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Periodo"), "Personalizado");

    fireEvent.change(screen.getByLabelText("Data inicial"), {
      target: { value: oldDate },
    });
    fireEvent.change(screen.getByLabelText("Data final"), {
      target: { value: oldDate },
    });
    await user.click(screen.getByRole("button", { name: CATEGORY_ENTRY }));

    expect(screen.getAllByText("R$ 30.00")).toHaveLength(3);
  });

  it("remove transacao e atualiza persistencia", async () => {
    const user = userEvent.setup();
    saveTransactions([
      { id: 1, value: 30, type: CATEGORY_ENTRY, date: "2026-02-12" },
    ]);

    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /Excluir transacao 1/i }),
    );

    expect(
      await screen.findByText("Nenhum valor cadastrado."),
    ).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual([]);
  });
});
