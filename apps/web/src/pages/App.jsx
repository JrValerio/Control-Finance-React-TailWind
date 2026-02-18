import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import Modal from "../components/Modal";
import TransactionList from "../components/TransactionList";
import { transactionsService } from "../services/transactions.service";
import {
  CATEGORY_ALL,
  CATEGORY_ENTRY,
  CATEGORY_EXIT,
  PERIOD_ALL,
  PERIOD_CUSTOM,
  PERIOD_LAST_30_DAYS,
  PERIOD_LAST_7_DAYS,
  PERIOD_TODAY,
  getTodayISODate,
  normalizeTransactionDate,
  resolvePeriodRange,
} from "../components/DatabaseUtils";

const TransactionChart = lazy(() => import("../components/TransactionChart"));

const PERIOD_OPTIONS = [
  PERIOD_ALL,
  PERIOD_TODAY,
  PERIOD_LAST_7_DAYS,
  PERIOD_LAST_30_DAYS,
  PERIOD_CUSTOM,
];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50];
const PAGE_SIZE_STORAGE_KEY = "control_finance.page_size";
const DEFAULT_MONTHLY_SUMMARY = {
  month: "",
  income: 0,
  expense: 0,
  balance: 0,
  byCategory: [],
};

const getCurrentMonth = () => getTodayISODate().slice(0, 7);

const getApiErrorMessage = (error, fallbackMessage) => {
  return error?.response?.data?.message || error?.message || fallbackMessage;
};

const normalizeTransactions = (transactions) => {
  if (!Array.isArray(transactions)) {
    return [];
  }

  const fallbackDate = getTodayISODate();

  return transactions
    .map((transaction) => ({
      id: Number(transaction.id),
      value: Number(transaction.value),
      type: transaction.type,
      categoryId: Number.isInteger(Number(transaction.categoryId))
        ? Number(transaction.categoryId)
        : null,
      date: normalizeTransactionDate(transaction.date, fallbackDate),
      description: typeof transaction.description === "string" ? transaction.description : "",
      notes: typeof transaction.notes === "string" ? transaction.notes : "",
    }))
    .filter(
      (transaction) =>
        Number.isFinite(transaction.id) &&
        Number.isFinite(transaction.value) &&
        [CATEGORY_ENTRY, CATEGORY_EXIT].includes(transaction.type),
    );
};

const downloadBlobFile = (blob, fileName) => {
  const objectUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = objectUrl;
  downloadLink.download = fileName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(objectUrl);
};

const getInitialPageSize = () => {
  if (typeof window === "undefined") {
    return DEFAULT_LIMIT;
  }

  const storedPageSize = Number.parseInt(
    window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY) || "",
    10,
  );

  if (PAGE_SIZE_OPTIONS.includes(storedPageSize)) {
    return storedPageSize;
  }

  return DEFAULT_LIMIT;
};

const App = ({ onLogout = undefined }) => {
  const listSectionRef = useRef(null);
  const [selectedCategory, setSelectedCategory] = useState(CATEGORY_ALL);
  const [selectedPeriod, setSelectedPeriod] = useState(PERIOD_ALL);
  const [selectedTransactionCategoryId, setSelectedTransactionCategoryId] = useState("");
  const [selectedSummaryMonth, setSelectedSummaryMonth] = useState(() => getCurrentMonth());
  const [categories, setCategories] = useState([]);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(DEFAULT_PAGE);
  const [pageSize, setPageSize] = useState(() => getInitialPageSize());
  const [paginationMeta, setPaginationMeta] = useState(() => ({
    page: DEFAULT_PAGE,
    limit: getInitialPageSize(),
    total: 0,
    totalPages: 1,
  }));
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [pendingDeleteTransactionId, setPendingDeleteTransactionId] = useState(null);
  const [undoState, setUndoState] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [isLoadingTransactions, setLoadingTransactions] = useState(false);
  const [isLoadingSummary, setLoadingSummary] = useState(false);
  const [isExportingCsv, setExportingCsv] = useState(false);
  const [monthlySummary, setMonthlySummary] = useState(DEFAULT_MONTHLY_SUMMARY);
  const [summaryError, setSummaryError] = useState("");
  const [requestError, setRequestError] = useState("");
  const undoTimeoutRef = useRef(null);

  const periodRange = useMemo(
    () =>
      resolvePeriodRange(selectedPeriod, {
        startDate: customStartDate,
        endDate: customEndDate,
      }),
    [selectedPeriod, customStartDate, customEndDate],
  );

  const clearUndoState = useCallback(() => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    setUndoState(null);
  }, []);

  const scheduleUndo = useCallback(
    (transactionId) => {
      clearUndoState();
      setUndoState({ transactionId });
      undoTimeoutRef.current = setTimeout(() => {
        undoTimeoutRef.current = null;
        setUndoState(null);
      }, 10000);
    },
    [clearUndoState],
  );

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const categoryOptions = await transactionsService.listCategories();
      setCategories(Array.isArray(categoryOptions) ? categoryOptions : []);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const loadMonthlySummary = useCallback(async () => {
    setLoadingSummary(true);
    setSummaryError("");

    try {
      const summary = await transactionsService.getMonthlySummary(selectedSummaryMonth);
      setMonthlySummary({
        month: summary.month || selectedSummaryMonth,
        income: Number(summary.income) || 0,
        expense: Number(summary.expense) || 0,
        balance: Number(summary.balance) || 0,
        byCategory: Array.isArray(summary.byCategory) ? summary.byCategory : [],
      });
    } catch (error) {
      setMonthlySummary({
        ...DEFAULT_MONTHLY_SUMMARY,
        month: selectedSummaryMonth,
      });
      setSummaryError(getApiErrorMessage(error, "Nao foi possivel carregar o resumo mensal."));
    } finally {
      setLoadingSummary(false);
    }
  }, [selectedSummaryMonth]);

  useEffect(() => {
    loadMonthlySummary();
  }, [loadMonthlySummary]);

  const loadTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    setRequestError("");

    try {
      const response = await transactionsService.listPage({
        page: currentPage,
        limit: pageSize,
        from: periodRange.startDate || undefined,
        to: periodRange.endDate || undefined,
        type: selectedCategory !== CATEGORY_ALL ? selectedCategory : undefined,
        categoryId: selectedTransactionCategoryId
          ? Number(selectedTransactionCategoryId)
          : undefined,
      });

      setTransactions(normalizeTransactions(response.data));
      setPaginationMeta({
        page: response.meta.page,
        limit: response.meta.limit,
        total: response.meta.total,
        totalPages: response.meta.totalPages,
      });
    } catch (error) {
      setTransactions([]);
      setPaginationMeta({
        page: currentPage,
        limit: pageSize,
        total: 0,
        totalPages: 1,
      });
      setRequestError(getApiErrorMessage(error, "Nao foi possivel carregar as transacoes."));
    } finally {
      setLoadingTransactions(false);
    }
  }, [currentPage, pageSize, periodRange, selectedCategory, selectedTransactionCategoryId]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    if (currentPage > paginationMeta.totalPages) {
      setCurrentPage(paginationMeta.totalPages);
    }
  }, [currentPage, paginationMeta.totalPages]);

  const filteredTransactions = useMemo(() => {
    return transactions;
  }, [transactions]);

  const categoryNameById = useMemo(() => {
    const map = new Map();
    categories.forEach((category) => {
      map.set(Number(category.id), category.name);
    });
    return map;
  }, [categories]);

  const transactionsWithCategoryName = useMemo(() => {
    return filteredTransactions.map((transaction) => ({
      ...transaction,
      categoryName:
        transaction.categoryId === null
          ? "Sem categoria"
          : categoryNameById.get(transaction.categoryId) || "Categoria nao encontrada",
    }));
  }, [categoryNameById, filteredTransactions]);

  const chartData = useMemo(() => {
    return [
      { name: "Entradas", total: monthlySummary.income },
      { name: "Saidas", total: monthlySummary.expense },
    ];
  }, [monthlySummary.expense, monthlySummary.income]);

  const openCreateModal = () => {
    setEditingTransaction(null);
    setModalOpen(true);
  };

  const openEditModal = (transaction) => {
    setEditingTransaction(transaction);
    setModalOpen(true);
  };

  const handleSaveTransaction = async ({
    value,
    type,
    date,
    description,
    notes,
    categoryId,
  }) => {
    setRequestError("");

    try {
      if (editingTransaction) {
        await transactionsService.update(editingTransaction.id, {
          value,
          type,
          category_id: categoryId,
          date,
          description,
          notes,
        });
      } else {
        await transactionsService.create({
          value,
          type,
          category_id: categoryId,
          date,
          description,
          notes,
        });
      }

      setEditingTransaction(null);
      setModalOpen(false);
      await loadTransactions();
      await loadMonthlySummary();
      await loadCategories();
    } catch (error) {
      setRequestError(
        getApiErrorMessage(
          error,
          editingTransaction
            ? "Nao foi possivel atualizar a transacao."
            : "Nao foi possivel cadastrar a transacao.",
        ),
      );
    }
  };

  const requestDeleteTransaction = (id) => {
    setPendingDeleteTransactionId(id);
  };

  const closeDeleteDialog = () => {
    setPendingDeleteTransactionId(null);
  };

  const confirmDeleteTransaction = async () => {
    if (!pendingDeleteTransactionId) {
      return;
    }

    setRequestError("");

    try {
      await transactionsService.remove(pendingDeleteTransactionId);
      scheduleUndo(pendingDeleteTransactionId);
      setPendingDeleteTransactionId(null);
      await loadTransactions();
      await loadMonthlySummary();
    } catch (error) {
      setRequestError(getApiErrorMessage(error, "Nao foi possivel excluir a transacao."));
    }
  };

  const restoreDeletedTransaction = async () => {
    if (!undoState?.transactionId) {
      return;
    }

    setRequestError("");

    try {
      await transactionsService.restore(undoState.transactionId);
      clearUndoState();
      await loadTransactions();
      await loadMonthlySummary();
    } catch (error) {
      setRequestError(getApiErrorMessage(error, "Nao foi possivel desfazer a exclusao."));
    }
  };

  const handleExportCsv = async () => {
    setRequestError("");
    setExportingCsv(true);

    const exportFilters = {
      from: periodRange.startDate || undefined,
      to: periodRange.endDate || undefined,
      type: selectedCategory !== CATEGORY_ALL ? selectedCategory : undefined,
      categoryId: selectedTransactionCategoryId
        ? Number(selectedTransactionCategoryId)
        : undefined,
    };

    try {
      const exportResponse = await transactionsService.exportCsv(exportFilters);
      const csvBlob =
        exportResponse.blob instanceof Blob
          ? exportResponse.blob
          : new Blob([exportResponse.blob], { type: "text/csv;charset=utf-8" });
      const fallbackFileName = `transacoes-${getTodayISODate()}.csv`;

      downloadBlobFile(csvBlob, exportResponse.fileName || fallbackFileName);
    } catch (error) {
      setRequestError(getApiErrorMessage(error, "Nao foi possivel exportar o CSV."));
    } finally {
      setExportingCsv(false);
    }
  };

  const scrollToListTop = () => {
    const scrollTarget = listSectionRef.current;

    if (!scrollTarget || typeof scrollTarget.scrollIntoView !== "function") {
      return;
    }

    scrollTarget.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const goToPage = (nextPage) => {
    const clampedPage = Math.min(Math.max(nextPage, 1), paginationMeta.totalPages);

    if (clampedPage === currentPage) {
      return;
    }

    setCurrentPage(clampedPage);
    scrollToListTop();
  };

  const handlePreviousPage = () => {
    goToPage(currentPage - 1);
  };

  const handleNextPage = () => {
    goToPage(currentPage + 1);
  };

  const handleFirstPage = () => {
    goToPage(1);
  };

  const handleLastPage = () => {
    goToPage(paginationMeta.totalPages);
  };

  const handlePageSizeChange = (nextPageSize) => {
    const parsedPageSize = Number.parseInt(nextPageSize, 10);

    if (!PAGE_SIZE_OPTIONS.includes(parsedPageSize)) {
      return;
    }

    setPageSize(parsedPageSize);
    setCurrentPage(DEFAULT_PAGE);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(parsedPageSize));
    }

    scrollToListTop();
  };

  const filterButtons = [CATEGORY_ALL, CATEGORY_ENTRY, CATEGORY_EXIT];
  const hasActiveFilters =
    selectedCategory !== CATEGORY_ALL ||
    selectedPeriod !== PERIOD_ALL ||
    Boolean(selectedTransactionCategoryId);
  const hasMonthlySummaryData =
    monthlySummary.income > 0 ||
    monthlySummary.expense > 0 ||
    monthlySummary.byCategory.length > 0;
  const rangeStart =
    paginationMeta.total === 0 ? 0 : (paginationMeta.page - 1) * paginationMeta.limit + 1;
  const rangeEnd = Math.min(paginationMeta.page * paginationMeta.limit, paginationMeta.total);

  return (
    <div className="App min-h-screen bg-white pb-10">
      <header className="w-full bg-gray-500 p-2 shadow-md sm:p-4">
        <div className="mx-auto flex max-w-700 flex-col items-center justify-between gap-3 sm:flex-row">
          <h1 className="text-4xl font-semibold">
            <span className="text-brand-1">Control</span>
            <span className="text-gray-100">Finance</span>
          </h1>
          <div className="flex items-center gap-2">
            {onLogout ? (
              <button
                onClick={onLogout}
                className="rounded border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-100 hover:bg-gray-400"
              >
                Sair
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={isExportingCsv}
              className="rounded border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-100 hover:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExportingCsv ? "Exportando CSV..." : "Exportar CSV"}
            </button>
            <button
              onClick={openCreateModal}
              className="rounded bg-brand-1 px-4 py-2 font-semibold text-white hover:bg-brand-2"
            >
              Registrar novo valor
            </button>
          </div>
        </div>
      </header>

      <section className="mt-8 p-4 sm:mt-14">
        <div className="mx-auto flex max-w-700 flex-col gap-4">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <h2 className="text-lg font-medium text-gray-100">Resumo financeiro</h2>
            <div className="flex flex-wrap gap-2">
              {filterButtons.map((category) => {
                const active = selectedCategory === category;

                return (
                  <button
                    key={category}
                    onClick={() => {
                      setSelectedCategory(category);
                      setCurrentPage(DEFAULT_PAGE);
                    }}
                    className={`flex items-center justify-center gap-2.5 rounded border px-4 py-2 text-sm font-semibold transition-colors ${
                      active
                        ? "border-brand-1 bg-brand-3 text-brand-1"
                        : "border-gray-300 bg-white text-gray-200"
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded border border-gray-300 bg-white p-3">
            <label
              htmlFor="periodo"
              className="mb-2 block text-sm font-medium text-gray-100"
            >
              Periodo
            </label>
            <select
              id="periodo"
              value={selectedPeriod}
              onChange={(event) => {
                const nextPeriod = event.target.value;
                setSelectedPeriod(nextPeriod);
                setCurrentPage(DEFAULT_PAGE);

                if (nextPeriod !== PERIOD_CUSTOM) {
                  setCustomStartDate("");
                  setCustomEndDate("");
                }
              }}
              className="w-full rounded border border-gray-400 px-3 py-2 text-sm text-gray-200"
            >
              {PERIOD_OPTIONS.map((period) => (
                <option key={period} value={period}>
                  {period}
                </option>
              ))}
            </select>

            <div className="mt-3">
              <label
                htmlFor="categoria-filtro"
                className="mb-1 block text-xs font-medium text-gray-100"
              >
                Categoria
              </label>
              <select
                id="categoria-filtro"
                value={selectedTransactionCategoryId}
                onChange={(event) => {
                  setSelectedTransactionCategoryId(event.target.value);
                  setCurrentPage(DEFAULT_PAGE);
                }}
                className="w-full rounded border border-gray-400 px-3 py-2 text-sm text-gray-200"
              >
                <option value="">Todas</option>
                {categories.map((categoryOption) => (
                  <option key={categoryOption.id} value={String(categoryOption.id)}>
                    {categoryOption.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedPeriod === PERIOD_CUSTOM ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="data-inicial"
                    className="mb-1 block text-xs font-medium text-gray-100"
                  >
                    Data inicial
                  </label>
                  <input
                    id="data-inicial"
                    type="date"
                    value={customStartDate}
                    onChange={(event) => {
                      setCustomStartDate(event.target.value);
                      setCurrentPage(DEFAULT_PAGE);
                    }}
                    className="w-full rounded border border-gray-400 px-3 py-2 text-sm text-gray-200"
                  />
                </div>
                <div>
                  <label
                    htmlFor="data-final"
                    className="mb-1 block text-xs font-medium text-gray-100"
                  >
                    Data final
                  </label>
                  <input
                    id="data-final"
                    type="date"
                    value={customEndDate}
                    onChange={(event) => {
                      setCustomEndDate(event.target.value);
                      setCurrentPage(DEFAULT_PAGE);
                    }}
                    className="w-full rounded border border-gray-400 px-3 py-2 text-sm text-gray-200"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-2 p-4">
        <div className="mx-auto mb-2 flex max-w-700 items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-gray-100">Resumo mensal</h3>
          <input
            type="month"
            aria-label="Mes do resumo"
            value={selectedSummaryMonth}
            onChange={(event) => setSelectedSummaryMonth(event.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-100"
          />
        </div>
        {summaryError ? (
          <div
            className="mx-auto mb-3 flex max-w-700 items-center justify-between gap-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="status"
            aria-live="polite"
          >
            <span>{summaryError}</span>
            <button
              type="button"
              onClick={loadMonthlySummary}
              className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              Tentar novamente
            </button>
          </div>
        ) : null}
        <div className="mx-auto grid max-w-700 gap-3 sm:grid-cols-3">
          <div className="rounded border border-brand-1 bg-gray-400 px-4 py-3.5">
            <p className="text-xs font-medium uppercase text-gray-200">Saldo</p>
            <p className="text-base font-medium text-gray-100">
              {isLoadingSummary ? "Carregando..." : `R$ ${monthlySummary.balance.toFixed(2)}`}
            </p>
          </div>
          <div className="rounded border border-brand-1 bg-gray-400 px-4 py-3.5">
            <p className="text-xs font-medium uppercase text-gray-200">Entradas</p>
            <p className="text-base font-medium text-gray-100">
              {isLoadingSummary ? "Carregando..." : `R$ ${monthlySummary.income.toFixed(2)}`}
            </p>
          </div>
          <div className="rounded border border-brand-1 bg-gray-400 px-4 py-3.5">
            <p className="text-xs font-medium uppercase text-gray-200">Saidas</p>
            <p className="text-base font-medium text-gray-100">
              {isLoadingSummary ? "Carregando..." : `R$ ${monthlySummary.expense.toFixed(2)}`}
            </p>
          </div>
        </div>
        {!isLoadingSummary && !summaryError && !hasMonthlySummaryData ? (
          <div className="mx-auto mt-2 max-w-700 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-200">
            Sem dados para o mes selecionado.
          </div>
        ) : null}
      </section>

      <section className="mx-auto mt-2 max-w-700 p-4">
        <Suspense
          fallback={
            <div className="rounded border border-brand-1 bg-gray-500 p-4 text-sm text-gray-100">
              Carregando grafico...
            </div>
          }
        >
          <TransactionChart data={chartData} />
        </Suspense>
      </section>

      <section
        ref={listSectionRef}
        className="mx-auto mt-2 max-w-700 rounded border border-brand-1 bg-gray-500 px-4 py-3.5"
      >
        {requestError ? (
          <div className="p-4 text-center">
            <p className="text-sm font-medium text-red-300">{requestError}</p>
            <button
              onClick={loadTransactions}
              className="mt-2 font-medium text-brand-1 hover:text-brand-2"
            >
              Tentar novamente
            </button>
          </div>
        ) : isLoadingTransactions ? (
          <div className="space-y-2 p-2" role="status" aria-live="polite">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`transactions-skeleton-${index + 1}`}
                className="h-20 animate-pulse rounded border border-gray-300 bg-gray-400"
              />
            ))}
            <span className="sr-only">Carregando transacoes...</span>
          </div>
        ) : filteredTransactions.length === 0 ? (
          hasActiveFilters ? (
            <div className="p-4 text-center text-gray-100">
              Nenhum valor encontrado para os filtros selecionados.
            </div>
          ) : (
            <div className="p-4 text-center">
              <p className="text-gray-100">Nenhum valor cadastrado.</p>
              <button
                onClick={openCreateModal}
                className="font-medium text-brand-1 hover:text-brand-2"
              >
                Registrar valor
              </button>
            </div>
          )
        ) : (
          <TransactionList
            transactions={transactionsWithCategoryName}
            onDelete={requestDeleteTransaction}
            onEdit={openEditModal}
          />
        )}

        {!requestError && !isLoadingTransactions ? (
          <div className="mt-2 border-t border-gray-300 px-2 pt-3 text-sm text-gray-100">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span>
                Mostrando {rangeStart}-{rangeEnd} de {paginationMeta.total}
              </span>
              <label className="flex items-center gap-2 text-xs font-semibold">
                Itens por pagina
                <select
                  aria-label="Itens por pagina"
                  value={pageSize}
                  onChange={(event) => handlePageSizeChange(event.target.value)}
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-100"
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {paginationMeta.totalPages > 2 ? (
                <button
                  type="button"
                  onClick={handleFirstPage}
                  disabled={currentPage <= 1}
                  className="rounded border border-gray-300 px-3 py-1 font-semibold text-gray-100 hover:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Primeira
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePreviousPage}
                disabled={currentPage <= 1}
                className="rounded border border-gray-300 px-3 py-1 font-semibold text-gray-100 hover:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Anterior
              </button>
              <span>
                Pagina {currentPage} de {paginationMeta.totalPages}
              </span>
              <button
                type="button"
                onClick={handleNextPage}
                disabled={currentPage >= paginationMeta.totalPages}
                className="rounded border border-gray-300 px-3 py-1 font-semibold text-gray-100 hover:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Proxima
              </button>
              </div>
              {paginationMeta.totalPages > 2 ? (
                <button
                  type="button"
                  onClick={handleLastPage}
                  disabled={currentPage >= paginationMeta.totalPages}
                  className="rounded border border-gray-300 px-3 py-1 font-semibold text-gray-100 hover:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Ultima
                </button>
              ) : (
                <span />
              )}
            </div>
          </div>
        ) : null}
      </section>

      {undoState ? (
        <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-500 -translate-x-1/2 rounded border border-brand-1 bg-white px-4 py-3 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-100">Transacao removida.</p>
            <button
              type="button"
              onClick={restoreDeletedTransaction}
              className="rounded border border-brand-1 px-3 py-1 text-xs font-semibold text-brand-1 hover:bg-brand-3"
            >
              Desfazer
            </button>
          </div>
        </div>
      ) : null}

      {pendingDeleteTransactionId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-100 bg-opacity-50 p-4">
          <div className="w-full max-w-sm rounded bg-white p-4 shadow-lg">
            <h3 className="text-base font-semibold text-gray-100">Confirmar exclusao</h3>
            <p className="mt-2 text-sm text-gray-200">
              Deseja realmente excluir esta transacao?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteDialog}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteTransaction}
                className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
              >
                Confirmar exclusao
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingTransaction(null);
        }}
        onSave={handleSaveTransaction}
        categories={categories}
        initialTransaction={editingTransaction}
      />
    </div>
  );
};

export default App;

App.propTypes = {
  onLogout: PropTypes.func,
};
