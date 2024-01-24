import React, { useState, useEffect } from "react";
import Modal from "../components/Modal";
import TransactionList from "../components/TransactionList";
import { sumValues, filterByCategory } from "../components/DatabaseUtils";

const App = () => {
  const [category, setCategory] = useState("Todos");
  // const [transactions, setTransactions] = useState([]);
  // const [currentCategory, setCurrentCategory] = useState('Todos');
  const [activeButton, setActiveButton] = useState("Todos");
  const [isModalOpen, setModalOpen] = useState(false);
  const [transaction, setTransaction] = useState({ value: "", type: "" });
  const [transactions, setTransactions] = useState([
    { id: 1, value: 100, type: "Entrada" },
  ]);
  // const filteredTransactions = filterByCategory(transactions, category);
  const valuesCategory = ["Entrada", "Saída"];
  const [somaTotal, setSomaTotal] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [filteredTransactions, setFilteredTransactions] = useState([]);

  useEffect(() => {
    const filtered = filterByCategory(transactions, selectedCategory);
    setFilteredTransactions(filtered);
    setSomaTotal(calculateSum(filtered));
  }, [selectedCategory, transactions]);

  const openModal = () => setModalOpen(true);
  const closeModal = () => setModalOpen(false);
  const handleValueChange = (e) => {
    setTransaction({ ...transaction, value: e.target.value });
  };

  const handleTypeChange = (type) => {
    setTransaction({ ...transaction, type });
  };

  const calculateSum = (transactions) => {
    return transactions.reduce((acc, trans) => {
      if (trans.type === "Entrada") {
        return acc + trans.value;
      } else if (trans.type === "Saída") {
        return acc - trans.value;
      }
      return acc;
    }, 0);
  };

  const updateTransactionType = (type) => {
    setTransaction({ ...transaction, type });
  };

  const saveValue = () => {
    const valueNumber = parseFloat(transaction.value.replace(",", "."));
    if (isNaN(valueNumber)) {
      console.log("Por favor, insira um valor válido.");
      return;
    }
    const newEntry = {
      id:
        transactions.length > 0
          ? Math.max(...transactions.map((t) => t.id)) + 1
          : 1,
      value: valueNumber,
      type: transaction.type,
    };

    const updatedTransactions = [...transactions, newEntry];
    setTransactions(updatedTransactions);
    localStorage.setItem("transactions", JSON.stringify(updatedTransactions));
    closeModal();
  };

  useEffect(() => {
    const savedTransactions =
      JSON.parse(localStorage.getItem("transactions")) || [];
    setTransactions(savedTransactions);
  }, []);

  
  const deleteTransaction = (id) => {
    const updatedTransactions = transactions.filter((trans) => trans.id !== id);
    setTransactions(updatedTransactions);
    localStorage.setItem("transactions", JSON.stringify(updatedTransactions));
  };

  const handleCategoryChange = (newCategory) => {
    setSelectedCategory(newCategory);
    setActiveButton(newCategory);
  };

  return (
    <div className="App">
      <header className="bg-gray-500 p-2 sm:p-4 shadow-md w-full">
        <div className="mx-auto max-w-700 flex flex-col sm:flex-row justify-between items-center">
          <h1 className="text-4xl font-semibold">
            <span className="text-brand-1">Control</span>
            <span className="text-grey-1">Finance</span>
          </h1>
          <button
            onClick={openModal}
            className="bg-brand-1 hover:bg-brand-2 text-white font-semibold py-2 px-4 rounded"
          >
            Registrar novo valor
          </button>
        </div>
      </header>

      <section className="mt-8 sm:mt-14 p-4">
        <div className="mx-auto bg-gray overflow-hidden flex flex-col sm:flex-row justify-between items-center max-w-full sm:max-w-700">
          <h2 className="text-grey-1 text-lg font-medium">Resumo financeiro</h2>
          <div className="flex gap-2">
            <button
              onClick={() => handleCategoryChange("Todos")}
              className={`bg-white py-2 px-4 rounded border border-grey-300 flex items-center justify-center gap-2.5 text-grey-600 text-sm font-semibold 
  ${
    activeButton === "Todos"
      ? "text-brand-1 bg-brand-3 border-brand-1"
      : "text-grey-2 bg-white border-grey-3"
  }`}
            >
              Todos
            </button>
            <button
              onClick={() => handleCategoryChange("Entrada")}
              className={`bg-white py-2 px-4 rounded border border-grey-300 flex items-center justify-center gap-2.5 text-grey-600 text-sm font-semibold 
  ${
    activeButton === "Entrada"
      ? "text-brand-1 bg-brand-3 border-brand-1"
      : "text-grey-2 bg-white border-grey-3"
  }`}
            >
              Entradas
            </button>
            <button
              onClick={() => handleCategoryChange("Saída")}
              className={`bg-white py-2 px-4 rounded border border-grey-300 flex items-center justify-center gap-2.5 text-grey-600 text-sm font-semibold 
  ${
    activeButton === "Saída"
      ? "text-brand-1 bg-brand-3 border-brand-1"
      : "text-grey-2 bg-white border-grey-3"
  }`}
            >
              Saídas
            </button>
          </div>
        </div>
      </section>
      <section className="mt-6 p-4 ">
        <div className="mx-auto pt-3.5 pb-3.5 pl-3.5 pr-4 bg-gray-400 rounded border border-brand-1 flex justify-between items-center max-w-700">
          <span className="font-medium text-base text-gray-100 break-words">
            Soma dos valores:{" "}
          </span>
          <span className="font-medium text-base text-gray-100 break-words">
            R$ {somaTotal.toFixed(2)}
          </span>
        </div>
      </section>

      <section className="mx-auto pt-3.5 pb-3.5 pl-3.5 pr-4 bg-gray-500 rounded border border-brand-1  max-w-700">
        {transactions.length === 0 ? (
          <div className="text-center p-4">
            <p>Nenhum valor cadastrado</p>
            <button
              onClick={openModal}
              className="text-gray-100 hover:text-brand-1"
            >
              Registrar novo valor
            </button>
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
        onClose={closeModal}
        onSave={saveValue}
        transaction={transaction}
        onValueChange={handleValueChange}
        onTypeChange={handleTypeChange}
        insertedValues={transactions}
        setInsertedValues={setTransactions}
        updateTransactionType={updateTransactionType}
        activeButton={activeButton}
  setActiveButton={setActiveButton}
      />
    </div>
  );
};

export default App;
