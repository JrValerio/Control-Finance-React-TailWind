import { useEffect, useMemo, useState } from "react";
import Modal from "../components/Modal";
import TransactionList from "../components/TransactionList";
import {
  CATEGORY_ALL,
  CATEGORY_ENTRY,
  CATEGORY_EXIT,
  calculateBalance,
  filterByCategory,
} from "../components/DatabaseUtils";

const STORAGE_KEY = "transactions";

const normalizeTransactions = (transactions) => {
  if (!Array.isArray(transactions)) {
    return [];
  }

  return transactions
    .map((transaction) => ({
      id: Number(transaction.id),
      value: Number(transaction.value),
      type: transaction.type,
    }))
    .filter(
      (transaction) =>
        Number.isFinite(transaction.id) &&
        Number.isFinite(transaction.value) &&
        [CATEGORY_ENTRY, CATEGORY_EXIT].includes(transaction.type),
    );
};

const getInitialTransactions = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const savedTransactions = window.localStorage.getItem(STORAGE_KEY);
    if (!savedTransactions) {
      return [];
    }

    const parsedTransactions = JSON.parse(savedTransactions);
    return normalizeTransactions(parsedTransactions);
  } catch {
    return [];
  }
};

const App = () => {
  const [selectedCategory, setSelectedCategory] = useState(CATEGORY_ALL);
  const [isModalOpen, setModalOpen] = useState(false);
  const [transactions, setTransactions] = useState(getInitialTransactions);

  const filteredTransactions = useMemo(() => {
    return filterByCategory(transactions, selectedCategory);
  }, [transactions, selectedCategory]);

  const balance = useMemo(() => {
    return calculateBalance(filteredTransactions);
  }, [filteredTransactions]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }, [transactions]);

  const handleAddTransaction = ({ value, type }) => {
    setTransactions((currentTransactions) => {
      const nextId =
        currentTransactions.reduce(
          (highestId, transaction) => Math.max(highestId, transaction.id),
          0,
        ) + 1;

      return [
        ...currentTransactions,
        {
          id: nextId,
          value,
          type,
        },
      ];
    });

    setModalOpen(false);
  };

  const deleteTransaction = (id) => {
    setTransactions((currentTransactions) =>
      currentTransactions.filter((transaction) => transaction.id !== id),
    );
  };

  const filterButtons = [CATEGORY_ALL, CATEGORY_ENTRY, CATEGORY_EXIT];

  return (
    <div className="App min-h-screen bg-white">
      <header className="w-full bg-gray-500 p-2 shadow-md sm:p-4">
        <div className="mx-auto flex max-w-700 flex-col items-center justify-between gap-3 sm:flex-row">
          <h1 className="text-4xl font-semibold">
            <span className="text-brand-1">Control</span>
            <span className="text-gray-100">Finance</span>
          </h1>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded bg-brand-1 px-4 py-2 font-semibold text-white hover:bg-brand-2"
          >
            Registrar novo valor
          </button>
        </div>
      </header>

      <section className="mt-8 p-4 sm:mt-14">
        <div className="mx-auto flex max-w-full flex-col items-center justify-between gap-3 sm:max-w-700 sm:flex-row">
          <h2 className="text-lg font-medium text-gray-100">Resumo financeiro</h2>
          <div className="flex gap-2">
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
      </section>

      <section className="mt-6 p-4">
        <div className="mx-auto flex max-w-700 items-center justify-between rounded border border-brand-1 bg-gray-400 px-4 py-3.5">
          <span className="break-words text-base font-medium text-gray-100">
            Soma dos valores:
          </span>
          <span className="break-words text-base font-medium text-gray-100">
            R$ {balance.toFixed(2)}
          </span>
        </div>
      </section>

      <section className="mx-auto max-w-700 rounded border border-brand-1 bg-gray-500 px-4 py-3.5">
        {transactions.length === 0 ? (
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
            Nenhum valor encontrado para o filtro selecionado.
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
