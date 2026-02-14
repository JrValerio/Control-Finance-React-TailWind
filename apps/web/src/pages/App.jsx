import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
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
  getTotalsByType,
  normalizeTransactionDate,
} from "../components/DatabaseUtils";

const TransactionChart = lazy(() => import("../components/TransactionChart"));

const PERIOD_OPTIONS = [
  PERIOD_ALL,
  PERIOD_TODAY,
  PERIOD_LAST_7_DAYS,
  PERIOD_LAST_30_DAYS,
  PERIOD_CUSTOM,
];

const getApiErrorMessage = (error, fallbackMessage) => {
  return error?.response?.data?.message || fallbackMessage;
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
    }))
    .filter(
      (transaction) =>
        Number.isFinite(transaction.id) &&
        Number.isFinite(transaction.value) &&
        [CATEGORY_ENTRY, CATEGORY_EXIT].includes(transaction.type),
    );
};

const App = ({ onLogout = undefined }) => {
  const [selectedCategory, setSelectedCategory] = useState(CATEGORY_ALL);
  const [selectedPeriod, setSelectedPeriod] = useState(PERIOD_ALL);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [isModalOpen, setModalOpen] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [isLoadingTransactions, setLoadingTransactions] = useState(false);
  const [requestError, setRequestError] = useState("");

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

  const handleAddTransaction = async ({ value, type, date }) => {
    setRequestError("");

    try {
      const response = await transactionsService.create({
        value,
        type,
        date,
      });

      const [createdTransaction] = normalizeTransactions([response]);
      if (createdTransaction) {
        setTransactions((currentTransactions) => [
          ...currentTransactions,
          createdTransaction,
        ]);
      }

      setModalOpen(false);
    } catch (error) {
      setRequestError(
        getApiErrorMessage(error, "Nao foi possivel cadastrar a transacao."),
      );
    }
  };

  const deleteTransaction = async (id) => {
    setRequestError("");

    try {
      await transactionsService.remove(id);
      setTransactions((currentTransactions) =>
        currentTransactions.filter((transaction) => transaction.id !== id),
      );
    } catch (error) {
      setRequestError(
        getApiErrorMessage(error, "Nao foi possivel excluir a transacao."),
      );
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
              onClick={() => setModalOpen(true)}
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
              onClick={() => setModalOpen(true)}
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
            onDelete={deleteTransaction}
          />
        )}
      </section>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleAddTransaction}
      />
    </div>
  );
};

export default App;

App.propTypes = {
  onLogout: PropTypes.func,
};
