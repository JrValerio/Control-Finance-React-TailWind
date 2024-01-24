import React from "react";

const TransactionList = ({ transactions, onDelete }) => {
  return (
    <div className="mx-auto max-w-700 px-2 sm:px-0">
      {transactions.map((transaction) => (
        <div key={transaction.id} className="p-3.5 bg-gray-mode rounded border border-brand-1 flex justify-between items-center my-2">
          <div>
            <span className="text-gray-800 text-base font-medium">
              R$ {transaction.value.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded ${transaction.type === "Entrada" ? "bg-gray-400 text-gray-100" : "bg-gray-400 text-gray-100"} text-sm font-medium`}>
              {transaction.type}
            </span>
            <button onClick={() => onDelete(transaction.id)} className="text-gray-300 cursor-pointer hover:text-gray-200 transition duration-300">
              <i className="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TransactionList;
