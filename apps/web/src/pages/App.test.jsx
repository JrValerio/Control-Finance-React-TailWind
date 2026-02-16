import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { CATEGORY_ENTRY, CATEGORY_EXIT } from "../components/DatabaseUtils";
import { transactionsService } from "../services/transactions.service";

vi.mock("../components/TransactionChart", () => ({
  default: () => <div data-testid="transaction-chart" />,
}));

vi.mock("../services/transactions.service", () => ({
  transactionsService: {
    listPage: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    restore: vi.fn(),
    exportCsv: vi.fn(),
  },
}));

const buildPageResponse = (transactions = [], meta = {}) => ({
  data: transactions,
  meta: {
    page: 1,
    limit: 20,
    total: transactions.length,
    totalPages: 1,
    ...meta,
  },
});

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionsService.listPage.mockResolvedValue(buildPageResponse());
    transactionsService.update.mockResolvedValue({});
    transactionsService.restore.mockResolvedValue({});
    transactionsService.exportCsv.mockResolvedValue({
      blob: new Blob(["id,type\n1,Entrada"], { type: "text/csv;charset=utf-8" }),
      fileName: "transacoes.csv",
    });
  });

  it("carrega transacoes paginadas da API ao iniciar", async () => {
    transactionsService.listPage.mockResolvedValueOnce(
      buildPageResponse(
        [{ id: 1, value: 45, type: CATEGORY_ENTRY, date: "2026-02-13", description: "Freela" }],
        { page: 1, total: 45, totalPages: 3 },
      ),
    );

    render(<App />);

    expect(await screen.findByText("Freela")).toBeInTheDocument();
    expect(screen.getByText("Pagina 1 de 3")).toBeInTheDocument();
    expect(screen.getByText("Total: 45")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      from: undefined,
      to: undefined,
      type: undefined,
    });
  });

  it("navega para a proxima pagina", async () => {
    const user = userEvent.setup();
    transactionsService.listPage
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 1, value: 100, type: CATEGORY_ENTRY, date: "2026-02-13", description: "Pagina 1" }],
          { page: 1, total: 2, totalPages: 2 },
        ),
      )
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 2, value: 70, type: CATEGORY_EXIT, date: "2026-02-14", description: "Pagina 2" }],
          { page: 2, total: 2, totalPages: 2 },
        ),
      );

    render(<App />);

    expect(await screen.findByText("Pagina 1")).toBeInTheDocument();

    const previousButton = screen.getByRole("button", { name: "Anterior" });
    const nextButton = screen.getByRole("button", { name: "Proxima" });

    expect(previousButton).toBeDisabled();
    expect(nextButton).toBeEnabled();

    await user.click(nextButton);

    expect(await screen.findByText("Pagina 2")).toBeInTheDocument();
    expect(screen.getByText("Pagina 2 de 2")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenNthCalledWith(2, {
      page: 2,
      limit: 20,
      from: undefined,
      to: undefined,
      type: undefined,
    });
  });

  it("reseta para pagina 1 ao trocar filtro", async () => {
    const user = userEvent.setup();
    transactionsService.listPage
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 1, value: 100, type: CATEGORY_ENTRY, date: "2026-02-13", description: "Entrada p1" }],
          { page: 1, total: 2, totalPages: 2 },
        ),
      )
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 2, value: 80, type: CATEGORY_EXIT, date: "2026-02-13", description: "Saida p2" }],
          { page: 2, total: 2, totalPages: 2 },
        ),
      )
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 3, value: 60, type: CATEGORY_ENTRY, date: "2026-02-13", description: "Entrada filtrada" }],
          { page: 1, total: 1, totalPages: 1 },
        ),
      );

    render(<App />);

    expect(await screen.findByText("Entrada p1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Proxima" }));
    expect(await screen.findByText("Saida p2")).toBeInTheDocument();
    expect(screen.getByText("Pagina 2 de 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: CATEGORY_ENTRY }));

    expect(await screen.findByText("Entrada filtrada")).toBeInTheDocument();
    expect(screen.getByText("Pagina 1 de 1")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenLastCalledWith({
      page: 1,
      limit: 20,
      from: undefined,
      to: undefined,
      type: CATEGORY_ENTRY,
    });
  });

  it("adiciona transacao via API", async () => {
    const user = userEvent.setup();
    transactionsService.listPage
      .mockResolvedValueOnce(buildPageResponse())
      .mockResolvedValueOnce(
        buildPageResponse([
          {
            id: 1,
            value: 100.5,
            type: CATEGORY_ENTRY,
            date: "2026-02-13",
            description: "Extra",
            notes: "",
          },
        ]),
      );
    transactionsService.create.mockResolvedValueOnce({
      id: 1,
      value: 100.5,
      type: CATEGORY_ENTRY,
      date: "2026-02-13",
      description: "Extra",
      notes: "",
    });

    render(<App />);

    await screen.findByText("Nenhum valor cadastrado.");
    await user.click(screen.getByRole("button", { name: "Registrar novo valor" }));
    await user.type(screen.getByLabelText("Valor"), "100,50");
    await user.type(screen.getByLabelText("Descricao"), "Extra");
    fireEvent.change(screen.getByLabelText("Data"), {
      target: { value: "2026-02-13" },
    });
    await user.click(screen.getByRole("button", { name: "Inserir valor" }));

    expect(transactionsService.create).toHaveBeenCalledWith({
      value: 100.5,
      type: CATEGORY_ENTRY,
      date: "2026-02-13",
      description: "Extra",
      notes: "",
    });
    expect(await screen.findByText("Extra")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenCalledTimes(2);
  });

  it("edita transacao via API", async () => {
    const user = userEvent.setup();
    transactionsService.listPage
      .mockResolvedValueOnce(
        buildPageResponse([
          {
            id: 1,
            value: 150,
            type: CATEGORY_ENTRY,
            date: "2026-02-12",
            description: "Salario",
            notes: "",
          },
        ]),
      )
      .mockResolvedValueOnce(
        buildPageResponse([
          {
            id: 1,
            value: 120.5,
            type: CATEGORY_EXIT,
            date: "2026-02-12",
            description: "Mercado",
            notes: "Compra do mes",
          },
        ]),
      );
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
    const modalForm = screen.getByRole("button", { name: "Salvar alteracoes" }).closest("form");

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

    expect(await screen.findByText("Mercado")).toBeInTheDocument();
    expect(screen.getByText("Compra do mes")).toBeInTheDocument();
  });

  it("remove e restaura transacao com desfazer", async () => {
    const user = userEvent.setup();
    transactionsService.listPage
      .mockResolvedValueOnce(
        buildPageResponse([
          {
            id: 1,
            value: 45,
            type: CATEGORY_ENTRY,
            date: "2026-02-12",
            description: "Freela",
          },
        ]),
      )
      .mockResolvedValueOnce(buildPageResponse())
      .mockResolvedValueOnce(
        buildPageResponse([
          {
            id: 1,
            value: 45,
            type: CATEGORY_ENTRY,
            date: "2026-02-12",
            description: "Freela",
            notes: "",
          },
        ]),
      );
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

  it("exporta CSV usando filtros ativos", async () => {
    const user = userEvent.setup();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURLMock = vi.fn(() => "blob:transacoes");
    const revokeObjectURLMock = vi.fn();
    const clickMock = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    URL.createObjectURL = createObjectURLMock;
    URL.revokeObjectURL = revokeObjectURLMock;

    try {
      transactionsService.listPage
        .mockResolvedValueOnce(buildPageResponse())
        .mockResolvedValue(buildPageResponse());

      render(<App />);

      await screen.findByText("Resumo financeiro");
      await user.selectOptions(screen.getByLabelText("Periodo"), "Personalizado");
      fireEvent.change(screen.getByLabelText("Data inicial"), {
        target: { value: "2026-02-01" },
      });
      fireEvent.change(screen.getByLabelText("Data final"), {
        target: { value: "2026-02-20" },
      });
      await user.click(screen.getByRole("button", { name: CATEGORY_EXIT }));
      await user.click(screen.getByRole("button", { name: "Exportar CSV" }));

      await waitFor(() => {
        expect(transactionsService.exportCsv).toHaveBeenCalledWith({
          from: "2026-02-01",
          to: "2026-02-20",
          type: CATEGORY_EXIT,
        });
      });
      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      expect(clickMock).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:transacoes");
    } finally {
      clickMock.mockRestore();
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });
});
