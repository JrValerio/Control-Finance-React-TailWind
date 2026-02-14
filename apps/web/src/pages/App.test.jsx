import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { CATEGORY_ENTRY, CATEGORY_EXIT, getTodayISODate } from "../components/DatabaseUtils";
import { transactionsService } from "../services/transactions.service";

vi.mock("../components/TransactionChart", () => ({
  default: () => <div data-testid="transaction-chart" />,
}));

vi.mock("../services/transactions.service", () => ({
  transactionsService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    restore: vi.fn(),
  },
}));

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
    vi.clearAllMocks();
    transactionsService.list.mockResolvedValue([]);
    transactionsService.update.mockResolvedValue({});
    transactionsService.restore.mockResolvedValue({});
  });

  it("carrega transacoes da API ao iniciar", async () => {
    transactionsService.list.mockResolvedValueOnce([
      { id: 1, value: 45, type: CATEGORY_ENTRY, date: "2026-02-13" },
    ]);

    render(<App />);

    expect(await screen.findAllByText("R$ 45.00")).toHaveLength(3);
    expect(transactionsService.list).toHaveBeenCalledTimes(1);
  });

  it("adiciona transacao via API", async () => {
    const user = userEvent.setup();
    transactionsService.create.mockResolvedValueOnce({
      id: 1,
      value: 100.5,
      type: CATEGORY_ENTRY,
      date: "2026-02-13",
    });

    render(<App />);

    await screen.findByText("Nenhum valor cadastrado.");
    await user.click(
      screen.getByRole("button", { name: "Registrar novo valor" }),
    );
    await user.type(screen.getByLabelText("Valor"), "100,50");
    fireEvent.change(screen.getByLabelText("Data"), {
      target: { value: "2026-02-13" },
    });
    await user.click(screen.getByRole("button", { name: "Inserir valor" }));

    expect(transactionsService.create).toHaveBeenCalledWith({
      value: 100.5,
      type: CATEGORY_ENTRY,
      date: "2026-02-13",
      description: "",
      notes: "",
    });

    expect(await screen.findAllByText("R$ 100.50")).toHaveLength(3);
    expect(screen.getByText("13/02/2026")).toBeInTheDocument();
  });

  it("filtra por categoria e periodo com dados da API", async () => {
    const user = userEvent.setup();
    const today = getTodayISODate();
    const oldDate = getDateWithOffset(-20);

    transactionsService.list.mockResolvedValueOnce([
      { id: 1, value: 100, type: CATEGORY_ENTRY, date: today },
      { id: 2, value: 40, type: CATEGORY_EXIT, date: today },
      { id: 3, value: 30, type: CATEGORY_ENTRY, date: oldDate },
    ]);

    render(<App />);

    await screen.findAllByText("R$ 100.00");
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

  it("remove transacao via API", async () => {
    const user = userEvent.setup();
    transactionsService.list.mockResolvedValueOnce([
      { id: 1, value: 30, type: CATEGORY_ENTRY, date: "2026-02-12" },
    ]);
    transactionsService.remove.mockResolvedValueOnce({ id: 1, success: true });

    render(<App />);

    await screen.findAllByText("R$ 30.00");
    await user.click(
      screen.getByRole("button", { name: /Excluir transacao 1/i }),
    );
    await user.click(screen.getByRole("button", { name: "Confirmar exclusao" }));

    await waitFor(() => {
      expect(transactionsService.remove).toHaveBeenCalledWith(1);
    });
    expect(
      await screen.findByText("Nenhum valor cadastrado."),
    ).toBeInTheDocument();
  });

  it("edita transacao via API", async () => {
    const user = userEvent.setup();
    transactionsService.list.mockResolvedValueOnce([
      {
        id: 1,
        value: 150,
        type: CATEGORY_ENTRY,
        date: "2026-02-12",
        description: "Salario",
        notes: "",
      },
    ]);
    transactionsService.update.mockResolvedValueOnce({
      id: 1,
      value: 120.5,
      type: CATEGORY_EXIT,
      date: "2026-02-12",
      description: "Mercado",
      notes: "Compra do mes",
    });

    render(<App />);

    await screen.findByText("Salario");
    await user.click(screen.getByRole("button", { name: /Editar transacao 1/i }));
    const modalForm = screen
      .getByRole("button", { name: "Salvar alteracoes" })
      .closest("form");
    if (!modalForm) {
      throw new Error("Formulario de edicao nao encontrado.");
    }
    const modalQueries = within(modalForm);

    await user.clear(modalQueries.getByLabelText("Valor"));
    await user.type(modalQueries.getByLabelText("Valor"), "120,50");
    await user.clear(modalQueries.getByLabelText("Descricao"));
    await user.type(modalQueries.getByLabelText("Descricao"), "Mercado");
    await user.clear(modalQueries.getByLabelText("Observacoes"));
    await user.type(modalQueries.getByLabelText("Observacoes"), "Compra do mes");
    await user.click(modalQueries.getByRole("button", { name: "Saida" }));
    await user.click(modalQueries.getByRole("button", { name: "Salvar alteracoes" }));

    await waitFor(() => {
      expect(transactionsService.update).toHaveBeenCalledWith(1, {
        value: 120.5,
        type: CATEGORY_EXIT,
        date: "2026-02-12",
        description: "Mercado",
        notes: "Compra do mes",
      });
    });

    expect(await screen.findAllByText("R$ 120.50")).toHaveLength(2);
    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.getByText("Compra do mes")).toBeInTheDocument();
  });

  it("remove e restaura transacao com desfazer", async () => {
    const user = userEvent.setup();
    transactionsService.list.mockResolvedValueOnce([
      {
        id: 1,
        value: 45,
        type: CATEGORY_ENTRY,
        date: "2026-02-12",
        description: "Freela",
      },
    ]);
    transactionsService.remove.mockResolvedValueOnce({ id: 1, success: true });
    transactionsService.restore.mockResolvedValueOnce({
      id: 1,
      value: 45,
      type: CATEGORY_ENTRY,
      date: "2026-02-12",
      description: "Freela",
      notes: "",
    });

    render(<App />);

    await screen.findByText("Freela");
    await user.click(screen.getByRole("button", { name: /Excluir transacao 1/i }));
    await user.click(screen.getByRole("button", { name: "Confirmar exclusao" }));

    await waitFor(() => {
      expect(transactionsService.remove).toHaveBeenCalledWith(1);
    });

    expect(await screen.findByText("Transacao removida.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Desfazer" }));

    await waitFor(() => {
      expect(transactionsService.restore).toHaveBeenCalledWith(1);
    });

    expect(await screen.findByText("Freela")).toBeInTheDocument();
  });
});
