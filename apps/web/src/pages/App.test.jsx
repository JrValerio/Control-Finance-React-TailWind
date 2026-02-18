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
    listCategories: vi.fn(),
    getMonthlySummary: vi.fn(),
    getImportHistory: vi.fn(),
    dryRunImportCsv: vi.fn(),
    commitImportCsv: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    restore: vi.fn(),
    exportCsv: vi.fn(),
  },
}));

const buildPageResponse = (transactions = [], meta = {}) => ({
  data: transactions,
  meta: (() => {
    const hasExplicitOffset = Object.prototype.hasOwnProperty.call(meta, "offset");
    const normalizedMeta = {
      page: 1,
      limit: 20,
      total: transactions.length,
      totalPages: 1,
      ...meta,
    };

    if (!hasExplicitOffset || typeof normalizedMeta.offset !== "number") {
      normalizedMeta.offset = (normalizedMeta.page - 1) * normalizedMeta.limit;
    }

    return normalizedMeta;
  })(),
});

const buildSummaryResponse = (summary = {}) => ({
  month: "2026-02",
  income: 1000,
  expense: 350,
  balance: 650,
  byCategory: [],
  ...summary,
});

const buildImportDryRunResponse = (payload = {}) => ({
  importId: "11111111-1111-4111-8111-111111111111",
  expiresAt: "2026-03-01T10:00:00.000Z",
  summary: {
    totalRows: 2,
    validRows: 1,
    invalidRows: 1,
    income: 100,
    expense: 0,
  },
  rows: [
    {
      line: 2,
      status: "valid",
      raw: {
        date: "2026-03-01",
        type: "Entrada",
        value: "100",
        description: "Salario",
        notes: "",
        category: "",
      },
      normalized: {
        date: "2026-03-01",
        type: "Entrada",
        value: 100,
        description: "Salario",
        notes: "",
        categoryId: null,
      },
      errors: [],
    },
    {
      line: 3,
      status: "invalid",
      raw: {
        date: "2026-03-05",
        type: "Saida",
        value: "0",
        description: "Cafe",
        notes: "",
        category: "Lazer",
      },
      normalized: null,
      errors: [{ field: "value", message: "Valor invalido." }],
    },
  ],
  ...payload,
});

const buildImportHistoryResponse = (payload = {}) => ({
  items: [],
  pagination: {
    limit: 20,
    offset: 0,
  },
  ...payload,
});

describe("App", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/app");
    transactionsService.listPage.mockResolvedValue(buildPageResponse());
    transactionsService.listCategories.mockResolvedValue([]);
    transactionsService.getMonthlySummary.mockResolvedValue(buildSummaryResponse());
    transactionsService.getImportHistory.mockResolvedValue(buildImportHistoryResponse());
    transactionsService.dryRunImportCsv.mockResolvedValue(buildImportDryRunResponse());
    transactionsService.commitImportCsv.mockResolvedValue({
      imported: 1,
      summary: {
        income: 100,
        expense: 0,
        balance: 100,
      },
    });
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
    expect(screen.getByText("Mostrando 1-1 de 45")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
      from: undefined,
      to: undefined,
      type: undefined,
      categoryId: undefined,
    });
  });

  it("carrega resumo mensal e exibe cards com valores da API", async () => {
    transactionsService.getMonthlySummary.mockResolvedValueOnce(
      buildSummaryResponse({
        month: "2026-02",
        income: 1500,
        expense: 420.5,
        balance: 1079.5,
      }),
    );

    render(<App />);

    expect(await screen.findByText("R$ 1079.50")).toBeInTheDocument();
    expect(screen.getByText("R$ 1500.00")).toBeInTheDocument();
    expect(screen.getByText("R$ 420.50")).toBeInTheDocument();
    expect(transactionsService.getMonthlySummary).toHaveBeenCalledWith(expect.any(String));
  });

  it("aplica filtro por categoria e envia categoryId para listagem", async () => {
    const user = userEvent.setup();
    transactionsService.listCategories.mockResolvedValueOnce([
      { id: 1, name: "Alimentacao" },
      { id: 2, name: "Transporte" },
    ]);
    transactionsService.listPage
      .mockResolvedValueOnce(
        buildPageResponse([
          {
            id: 1,
            value: 100,
            type: CATEGORY_EXIT,
            date: "2026-02-13",
            description: "Inicial",
            categoryId: null,
          },
        ]),
      )
      .mockResolvedValueOnce(
        buildPageResponse([
          {
            id: 2,
            value: 90,
            type: CATEGORY_EXIT,
            date: "2026-02-14",
            description: "Filtrada",
            categoryId: 1,
          },
        ]),
      );

    render(<App />);

    expect(await screen.findByText("Inicial")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Categoria"), "1");
    expect(await screen.findByText("Filtrada")).toBeInTheDocument();
    expect(screen.getByText("Categoria: Alimentacao")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenLastCalledWith({
      limit: 20,
      offset: 0,
      from: undefined,
      to: undefined,
      type: undefined,
      categoryId: 1,
    });
  });

  it("exibe estado vazio no resumo mensal quando nao ha dados", async () => {
    transactionsService.getMonthlySummary.mockResolvedValueOnce(
      buildSummaryResponse({
        income: 0,
        expense: 0,
        balance: 0,
        byCategory: [],
      }),
    );

    render(<App />);

    expect(await screen.findByText("Sem dados para o mes selecionado.")).toBeInTheDocument();
  });

  it("exibe erro no resumo mensal e permite tentar novamente", async () => {
    const user = userEvent.setup();
    transactionsService.getMonthlySummary
      .mockRejectedValueOnce({})
      .mockResolvedValueOnce(
        buildSummaryResponse({
          income: 900,
          expense: 200,
          balance: 700,
        }),
      );

    render(<App />);

    expect(
      await screen.findByText("Nao foi possivel carregar o resumo mensal."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByText("R$ 700.00")).toBeInTheDocument();
    expect(screen.queryByText("Nao foi possivel carregar o resumo mensal.")).not.toBeInTheDocument();
  });

  it("abre historico de imports com loading e renderiza itens", async () => {
    const user = userEvent.setup();
    let resolveHistoryRequest;
    const pendingHistoryRequest = new Promise((resolve) => {
      resolveHistoryRequest = resolve;
    });

    transactionsService.getImportHistory.mockReturnValueOnce(pendingHistoryRequest);

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Historico de imports" }));

    expect(await screen.findByText("Carregando historico...")).toBeInTheDocument();

    resolveHistoryRequest(
      buildImportHistoryResponse({
        items: [
          {
            id: "import-1",
            createdAt: "2026-04-01T10:00:00.000Z",
            expiresAt: "2026-04-01T10:30:00.000Z",
            committedAt: "2026-04-01T10:10:00.000Z",
            summary: {
              totalRows: 2,
              validRows: 2,
              invalidRows: 0,
              income: 200,
              expense: 0,
              imported: 2,
            },
          },
        ],
      }),
    );

    expect(await screen.findByText("Committed")).toBeInTheDocument();
    expect(transactionsService.getImportHistory).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
    });
  });

  it("exibe estado vazio no historico de imports", async () => {
    const user = userEvent.setup();
    transactionsService.getImportHistory.mockResolvedValueOnce(
      buildImportHistoryResponse({
        items: [],
      }),
    );

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Historico de imports" }));

    expect(await screen.findByText("Sem imports para exibir.")).toBeInTheDocument();
  });

  it("exibe erro ao carregar historico de imports", async () => {
    const user = userEvent.setup();
    transactionsService.getImportHistory.mockRejectedValueOnce({
      response: {
        data: {
          message: "Falha ao carregar historico.",
        },
      },
    });

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Historico de imports" }));

    expect(await screen.findByText("Falha ao carregar historico.")).toBeInTheDocument();
  });

  it("pagina historico de imports ao clicar em Proxima", async () => {
    const user = userEvent.setup();
    const firstPageItems = Array.from({ length: 20 }, (_unused, index) => ({
      id: `import-${index + 1}`,
      createdAt: "2026-04-01T10:00:00.000Z",
      expiresAt: "2026-04-01T10:30:00.000Z",
      committedAt: null,
      summary: {
        totalRows: 1,
        validRows: 1,
        invalidRows: 0,
        income: 10,
        expense: 0,
        imported: 0,
      },
    }));

    transactionsService.getImportHistory
      .mockResolvedValueOnce(
        buildImportHistoryResponse({
          items: firstPageItems,
          pagination: {
            limit: 20,
            offset: 0,
          },
        }),
      )
      .mockResolvedValueOnce(
        buildImportHistoryResponse({
          items: [
            {
              id: "import-21",
              createdAt: "2026-04-01T11:00:00.000Z",
              expiresAt: "2026-04-01T11:30:00.000Z",
              committedAt: null,
              summary: {
                totalRows: 1,
                validRows: 1,
                invalidRows: 0,
                income: 20,
                expense: 0,
                imported: 0,
              },
            },
          ],
          pagination: {
            limit: 20,
            offset: 20,
          },
        }),
      );

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Historico de imports" }));
    expect(await screen.findByText("Mostrando 1-20")).toBeInTheDocument();
    const historyDialog = screen.getByRole("dialog", { name: "Historico de imports" });

    await user.click(within(historyDialog).getByRole("button", { name: "Proxima" }));

    await waitFor(() => {
      expect(transactionsService.getImportHistory).toHaveBeenLastCalledWith({
        limit: 20,
        offset: 20,
      });
    });
    expect(await screen.findByText("Mostrando 21-21")).toBeInTheDocument();
  });

  it("abre importacao CSV, processa dry-run e exibe preview", async () => {
    const user = userEvent.setup();
    const csvFile = new File(
      ["date,type,value,description\n2026-03-01,Entrada,100,Salario"],
      "import.csv",
      {
        type: "text/csv",
      },
    );

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Importar CSV" }));
    await user.upload(screen.getByLabelText("Arquivo CSV"), csvFile);
    await user.click(screen.getByRole("button", { name: "Pre-visualizar" }));

    expect(transactionsService.dryRunImportCsv).toHaveBeenCalledTimes(1);
    expect(transactionsService.dryRunImportCsv.mock.calls[0][0]).toBe(csvFile);
    expect(await screen.findByText("Salario")).toBeInTheDocument();
    expect(screen.getByText("Valor invalido.")).toBeInTheDocument();
    expect(screen.getByText("Sessao expira em: 2026-03-01T10:00:00.000Z")).toBeInTheDocument();
  });

  it("mantem botao importar desabilitado quando dry-run nao tem linhas validas", async () => {
    const user = userEvent.setup();
    const csvFile = new File(
      ["date,type,value,description\n2026-03-01,Saida,0,Cafe"],
      "import.csv",
      {
        type: "text/csv",
      },
    );
    transactionsService.dryRunImportCsv.mockResolvedValueOnce(
      buildImportDryRunResponse({
        summary: {
          totalRows: 1,
          validRows: 0,
          invalidRows: 1,
          income: 0,
          expense: 0,
        },
      }),
    );

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Importar CSV" }));
    await user.upload(screen.getByLabelText("Arquivo CSV"), csvFile);
    await user.click(screen.getByRole("button", { name: "Pre-visualizar" }));
    expect(await screen.findByText("Cafe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importar" })).toBeDisabled();
  });

  it("confirma importacao CSV e recarrega listagem e resumo", async () => {
    const user = userEvent.setup();
    const csvFile = new File(
      ["date,type,value,description\n2026-03-01,Entrada,100,Salario"],
      "import.csv",
      {
        type: "text/csv",
      },
    );
    transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildImportDryRunResponse());

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Importar CSV" }));
    await user.upload(screen.getByLabelText("Arquivo CSV"), csvFile);
    await user.click(screen.getByRole("button", { name: "Pre-visualizar" }));
    await screen.findByText("Salario");
    await user.click(screen.getByRole("button", { name: "Importar" }));

    await waitFor(() => {
      expect(transactionsService.commitImportCsv).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
      );
      expect(transactionsService.listPage).toHaveBeenCalledTimes(2);
      expect(transactionsService.getMonthlySummary).toHaveBeenCalledTimes(2);
    });

    expect(screen.queryByLabelText("Arquivo CSV")).not.toBeInTheDocument();
  });

  it("exibe mensagem de erro quando dry-run falha", async () => {
    const user = userEvent.setup();
    const csvFile = new File(
      ["date,type,value,description\n2026-03-01,Entrada,100,Salario"],
      "import.csv",
      {
        type: "text/csv",
      },
    );
    transactionsService.dryRunImportCsv.mockRejectedValueOnce({
      response: { data: { message: "Arquivo invalido. Envie um CSV." } },
    });

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Importar CSV" }));
    await user.upload(screen.getByLabelText("Arquivo CSV"), csvFile);
    await user.click(screen.getByRole("button", { name: "Pre-visualizar" }));

    expect(await screen.findByText("Arquivo invalido. Envie um CSV.")).toBeInTheDocument();
  });

  it("exibe orientacao para sessao expirada durante commit", async () => {
    const user = userEvent.setup();
    const csvFile = new File(
      ["date,type,value,description\n2026-03-01,Entrada,100,Salario"],
      "import.csv",
      {
        type: "text/csv",
      },
    );
    transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildImportDryRunResponse());
    transactionsService.commitImportCsv.mockRejectedValueOnce({
      response: { data: { message: "Sessao de importacao expirada." } },
    });

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Importar CSV" }));
    await user.upload(screen.getByLabelText("Arquivo CSV"), csvFile);
    await user.click(screen.getByRole("button", { name: "Pre-visualizar" }));
    await screen.findByText("Salario");
    await user.click(screen.getByRole("button", { name: "Importar" }));

    expect(
      await screen.findByText("Sessao de importacao expirada. Rode a pre-visualizacao novamente."),
    ).toBeInTheDocument();
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
      limit: 20,
      offset: 20,
      from: undefined,
      to: undefined,
      type: undefined,
      categoryId: undefined,
    });
  });

  it("permite alterar itens por pagina e reseta para pagina 1", async () => {
    const user = userEvent.setup();
    transactionsService.listPage
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 1, value: 100, type: CATEGORY_ENTRY, date: "2026-02-13", description: "P1" }],
          { page: 1, limit: 20, total: 35, totalPages: 2 },
        ),
      )
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 2, value: 90, type: CATEGORY_ENTRY, date: "2026-02-14", description: "P2" }],
          { page: 2, limit: 20, total: 35, totalPages: 2 },
        ),
      )
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 3, value: 80, type: CATEGORY_ENTRY, date: "2026-02-15", description: "P1-L10" }],
          { page: 1, limit: 10, total: 35, totalPages: 4 },
        ),
      );

    render(<App />);

    expect(await screen.findByText("P1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Proxima" }));
    expect(await screen.findByText("P2")).toBeInTheDocument();
    expect(screen.getByText("Pagina 2 de 2")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Itens por pagina"), "10");

    expect(await screen.findByText("P1-L10")).toBeInTheDocument();
    expect(screen.getByText("Pagina 1 de 4")).toBeInTheDocument();
    expect(screen.getByText("Mostrando 1-1 de 35")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenLastCalledWith({
      limit: 10,
      offset: 0,
      from: undefined,
      to: undefined,
      type: undefined,
      categoryId: undefined,
    });
  });

  it("permite navegar para a ultima pagina", async () => {
    const user = userEvent.setup();
    transactionsService.listPage
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 1, value: 100, type: CATEGORY_ENTRY, date: "2026-02-13", description: "Pagina inicial" }],
          { page: 1, limit: 20, total: 61, totalPages: 4 },
        ),
      )
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 4, value: 50, type: CATEGORY_EXIT, date: "2026-02-16", description: "Pagina final" }],
          { page: 4, limit: 20, total: 61, totalPages: 4 },
        ),
      );

    render(<App />);

    expect(await screen.findByText("Pagina inicial")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ultima" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Ultima" }));

    expect(await screen.findByText("Pagina final")).toBeInTheDocument();
    expect(screen.getByText("Pagina 4 de 4")).toBeInTheDocument();
    expect(screen.getByText("Mostrando 61-61 de 61")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenNthCalledWith(2, {
      limit: 20,
      offset: 60,
      from: undefined,
      to: undefined,
      type: undefined,
      categoryId: undefined,
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
      limit: 20,
      offset: 0,
      from: undefined,
      to: undefined,
      type: CATEGORY_ENTRY,
      categoryId: undefined,
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
      category_id: null,
      date: "2026-02-13",
      description: "Extra",
      notes: "",
    });
    expect(await screen.findByText("Extra")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenCalledTimes(2);
  });

  it("adiciona transacao com categoria selecionada", async () => {
    const user = userEvent.setup();
    transactionsService.listCategories.mockResolvedValueOnce([{ id: 7, name: "Lazer" }]);
    transactionsService.listPage
      .mockResolvedValueOnce(buildPageResponse())
      .mockResolvedValueOnce(
        buildPageResponse([
          {
            id: 7,
            value: 60,
            type: CATEGORY_EXIT,
            categoryId: 7,
            date: "2026-02-13",
            description: "Cinema",
            notes: "",
          },
        ]),
      );
    transactionsService.create.mockResolvedValueOnce({
      id: 7,
      value: 60,
      type: CATEGORY_EXIT,
      categoryId: 7,
      date: "2026-02-13",
      description: "Cinema",
      notes: "",
    });

    render(<App />);

    await screen.findByText("Nenhum valor cadastrado.");
    await user.click(screen.getByRole("button", { name: "Registrar novo valor" }));
    const modalForm = screen.getByRole("button", { name: "Inserir valor" }).closest("form");

    if (!modalForm) {
      throw new Error("Formulario de criacao nao encontrado.");
    }

    const modalQueries = within(modalForm);

    await user.type(modalQueries.getByLabelText("Valor"), "60,00");
    await user.type(modalQueries.getByLabelText("Descricao"), "Cinema");
    await user.click(modalQueries.getByRole("button", { name: "Saida" }));
    await user.selectOptions(modalQueries.getByLabelText("Categoria"), "7");
    fireEvent.change(modalQueries.getByLabelText("Data"), {
      target: { value: "2026-02-13" },
    });
    await user.click(modalQueries.getByRole("button", { name: "Inserir valor" }));

    expect(transactionsService.create).toHaveBeenCalledWith({
      value: 60,
      type: CATEGORY_EXIT,
      category_id: 7,
      date: "2026-02-13",
      description: "Cinema",
      notes: "",
    });
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
        category_id: null,
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
          categoryId: undefined,
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
