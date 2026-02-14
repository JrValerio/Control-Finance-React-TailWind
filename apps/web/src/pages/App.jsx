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
  calculateBalance,
  filterByCategory,
  filterByPeriod,
  getTodayISODate,
  isValidISODate,
  getTotalsByType,
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
const EXPORT_TOAST_AUTO_HIDE_MS = 4000;
const EXPORT_CATEGORY_FILENAME_MAP = {
  [CATEGORY_ALL]: "todas",
  [CATEGORY_ENTRY]: "entrada",
  [CATEGORY_EXIT]: "saida",
};

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

const resolveExportDateRangeForFileName = (periodRange, visibleTransactions) => {
  const today = getTodayISODate();
  const hasPeriodRange = Boolean(periodRange.startDate || periodRange.endDate);

  if (hasPeriodRange) {
    return {
      startDate: periodRange.startDate || periodRange.endDate || today,
      endDate: periodRange.endDate || periodRange.startDate || today,
    };
  }

  const sortedDates = visibleTransactions
    .map((transaction) => transaction.date)
    .filter(isValidISODate)
    .sort();

  if (sortedDates.length === 0) {
    return {
      startDate: today,
      endDate: today,
    };
  }

  return {
    startDate: sortedDates[0],
    endDate: sortedDates[sortedDates.length - 1],
  };
};

const buildExportFallbackFileName = ({ category, startDate, endDate }) => {
  const categoryLabel =
    EXPORT_CATEGORY_FILENAME_MAP[category] || EXPORT_CATEGORY_FILENAME_MAP[CATEGORY_ALL];

  return `transacoes-${categoryLabel}-${startDate}-a-${endDate}.csv`;
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

const App = ({ onLogout = undefined }) => {
  const [selectedCategory, setSelectedCategory] = useState(CATEGORY_ALL);
  const [selectedPeriod, setSelectedPeriod] = useState(PERIOD_ALL);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [pendingDeleteTransactionId, setPendingDeleteTransactionId] = useState(null);
  const [undoState, setUndoState] = useState(null);
  const [exportToast, setExportToast] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [isLoadingTransactions, setLoadingTransactions] = useState(false);
  const [isExportingCsv, setExportingCsv] = useState(false);
  const [requestError, setRequestError] = useState("");
  const undoTimeoutRef = useRef(null);
  const exportToastTimeoutRef = useRef(null);

  const clearUndoState = useCallback(() => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    setUndoState(null);
  }, []);

  const clearExportToast = useCallback(() => {
    if (exportToastTimeoutRef.current) {
      clearTimeout(exportToastTimeoutRef.current);
      exportToastTimeoutRef.current = null;
    }

    setExportToast(null);
  }, []);

  const showExportToast = useCallback(
    (type, message) => {
      clearExportToast();
      setExportToast({
        type,
        message,
      });
      exportToastTimeoutRef.current = setTimeout(() => {
        exportToastTimeoutRef.current = null;
        setExportToast(null);
      }, EXPORT_TOAST_AUTO_HIDE_MS);
    },
    [clearExportToast],
  );

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

      if (exportToastTimeoutRef.current) {
        clearTimeout(exportToastTimeoutRef.current);
      }
    };
  }, []);

  const loadTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    setRequestError("");

    try {
      const response = await transactionsService.list();
      setTransactions(normalizeTransactions(response));
    } catch (error) {
      setTransactions([]);
      setRequestError(
        getApiErrorMessage(error, "Nao foi possivel carregar as transacoes."),
      );
    } finally {
      setLoadingTransactions(false);
    }
  }, []);

  const periodFilteredTransactions = useMemo(() => {
    return filterByPeriod(transactions, selectedPeriod, {
      startDate: customStartDate,
      endDate: customEndDate,
    });
  }, [transactions, selectedPeriod, customStartDate, customEndDate]);

  const filteredTransactions = useMemo(() => {
    return filterByCategory(periodFilteredTransactions, selectedCategory);
  }, [periodFilteredTransactions, selectedCategory]);

  const balance = useMemo(() => {
    return calculateBalance(filteredTransactions);
  }, [filteredTransactions]);

  const totalsByType = useMemo(() => {
    return getTotalsByType(periodFilteredTransactions);
  }, [periodFilteredTransactions]);

  const chartData = useMemo(() => {
    return [
      { name: "Entradas", total: totalsByType.entry },
      { name: "Saidas", total: totalsByType.exit },
    ];
  }, [totalsByType]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const openCreateModal = () => {
    setEditingTransaction(null);
    setModalOpen(true);
  };

  const openEditModal = (transaction) => {
    setEditingTransaction(transaction);
    setModalOpen(true);
  };

  const handleSaveTransaction = async ({ value, type, date, description, notes }) => {
    setRequestError("");

    try {
      const response = editingTransaction
        ? await transactionsService.update(editingTransaction.id, {
            value,
            type,
            date,
            description,
            notes,
          })
        : await transactionsService.create({
            value,
            type,
            date,
            description,
            notes,
          });

      const [savedTransaction] = normalizeTransactions([response]);
      if (savedTransaction) {
        setTransactions((currentTransactions) => {
          const transactionsWithoutSaved = currentTransactions.filter(
            (transaction) => transaction.id !== savedTransaction.id,
          );

          return [...transactionsWithoutSaved, savedTransaction].sort(
            (left, right) => left.id - right.id,
          );
        });
      }

      setEditingTransaction(null);
      setModalOpen(false);
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
      setTransactions((currentTransactions) =>
        currentTransactions.filter(
          (transaction) => transaction.id !== pendingDeleteTransactionId,
        ),
      );
      scheduleUndo(pendingDeleteTransactionId);
      setPendingDeleteTransactionId(null);
    } catch (error) {
      setRequestError(
        getApiErrorMessage(error, "Nao foi possivel excluir a transacao."),
      );
    }
  };

  const restoreDeletedTransaction = async () => {
    if (!undoState?.transactionId) {
      return;
    }

    setRequestError("");

    try {
      const response = await transactionsService.restore(undoState.transactionId);
      const [restoredTransaction] = normalizeTransactions([response]);

      if (restoredTransaction) {
        setTransactions((currentTransactions) => {
          const transactionsWithoutRestored = currentTransactions.filter(
            (transaction) => transaction.id !== restoredTransaction.id,
          );

          return [...transactionsWithoutRestored, restoredTransaction].sort(
            (left, right) => left.id - right.id,
          );
        });
      }

      clearUndoState();
    } catch (error) {
      setRequestError(
        getApiErrorMessage(error, "Nao foi possivel desfazer a exclusao."),
      );
    }
  };

  const handleExportCsv = async () => {
    if (isExportingCsv) {
      return;
    }

    setRequestError("");
    clearExportToast();
    setExportingCsv(true);

    const periodRange = resolvePeriodRange(selectedPeriod, {
      startDate: customStartDate,
      endDate: customEndDate,
    });
    const exportFilters = {
      from: periodRange.startDate || undefined,
      to: periodRange.endDate || undefined,
      type:
        selectedCategory !== CATEGORY_ALL ? selectedCategory : undefined,
    };
    const fallbackRange = resolveExportDateRangeForFileName(
      periodRange,
      filteredTransactions,
    );
    const fallbackFileName = buildExportFallbackFileName({
      category: selectedCategory,
      startDate: fallbackRange.startDate,
      endDate: fallbackRange.endDate,
    });

    try {
      const exportResponse = await transactionsService.exportCsv(exportFilters);
      const csvBlob =
        exportResponse.blob instanceof Blob
          ? exportResponse.blob
          : new Blob([exportResponse.blob], { type: "text/csv;charset=utf-8" });

      downloadBlobFile(csvBlob, exportResponse.fileName || fallbackFileName);
      showExportToast("success", "CSV exportado com sucesso.");
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, "Nao foi possivel exportar o CSV.");
      setRequestError(
        errorMessage,
      );
      showExportToast("error", errorMessage);
    } finally {
      setExportingCsv(false);
    }
  };

  const filterButtons = [CATEGORY_ALL, CATEGORY_ENTRY, CATEGORY_EXIT];

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
              title="Exporta as transacoes filtradas em CSV"
              aria-busy={isExportingCsv}
              className="rounded border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-100 hover:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExportingCsv ? (
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand-1"
                    aria-hidden="true"
                  />
                  Exportando CSV...
                </span>
              ) : (
                "Exportar CSV"
              )}
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
                    onClick={() => setSelectedCategory(category)}
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
                    onChange={(event) => setCustomStartDate(event.target.value)}
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
                    onChange={(event) => setCustomEndDate(event.target.value)}
                    className="w-full rounded border border-gray-400 px-3 py-2 text-sm text-gray-200"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-2 p-4">
        <div className="mx-auto grid max-w-700 gap-3 sm:grid-cols-3">
          <div className="rounded border border-brand-1 bg-gray-400 px-4 py-3.5">
            <p className="text-xs font-medium uppercase text-gray-200">Saldo</p>
            <p className="text-base font-medium text-gray-100">R$ {balance.toFixed(2)}</p>
          </div>
          <div className="rounded border border-brand-1 bg-gray-400 px-4 py-3.5">
            <p className="text-xs font-medium uppercase text-gray-200">Entradas</p>
            <p className="text-base font-medium text-gray-100">
              R$ {totalsByType.entry.toFixed(2)}
            </p>
          </div>
          <div className="rounded border border-brand-1 bg-gray-400 px-4 py-3.5">
            <p className="text-xs font-medium uppercase text-gray-200">Saidas</p>
            <p className="text-base font-medium text-gray-100">
              R$ {totalsByType.exit.toFixed(2)}
            </p>
          </div>
        </div>
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

      <section className="mx-auto mt-2 max-w-700 rounded border border-brand-1 bg-gray-500 px-4 py-3.5">
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
          <div className="p-4 text-center text-gray-100">Carregando transacoes...</div>
        ) : transactions.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-gray-100">Nenhum valor cadastrado.</p>
            <button
              onClick={openCreateModal}
              className="font-medium text-brand-1 hover:text-brand-2"
            >
              Registrar valor
            </button>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="p-4 text-center text-gray-100">
            Nenhum valor encontrado para os filtros selecionados.
          </div>
        ) : (
          <TransactionList
            transactions={filteredTransactions}
            onDelete={requestDeleteTransaction}
            onEdit={openEditModal}
          />
        )}
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

      {exportToast ? (
        <div className="fixed right-4 top-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded border border-gray-300 bg-white px-4 py-3 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <p
              role="status"
              aria-live="polite"
              className={`text-sm font-medium ${
                exportToast.type === "error" ? "text-red-600" : "text-green-700"
              }`}
            >
              {exportToast.message}
            </p>
            <button
              type="button"
              onClick={clearExportToast}
              className="text-xs font-semibold text-gray-200 hover:text-gray-100"
              aria-label="Fechar aviso de exportacao"
            >
              Fechar
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
        initialTransaction={editingTransaction}
      />
    </div>
  );
};

export default App;

App.propTypes = {
  onLogout: PropTypes.func,
};
