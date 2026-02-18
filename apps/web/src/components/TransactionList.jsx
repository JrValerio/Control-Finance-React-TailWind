import PropTypes from "prop-types";
import { CATEGORY_ENTRY } from "./DatabaseUtils";

const formatValue = (value) => `R$ ${value.toFixed(2)}`;

const formatDate = (value) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("pt-BR");
};

const TransactionList = ({ transactions, onDelete, onEdit }) => {
  return (
    <div className="mx-auto max-w-700 px-2 sm:px-0">
      {transactions.map((transaction) => (
        <div
          key={transaction.id}
          className="my-2 flex items-center justify-between rounded border border-brand-1 bg-gray-mode p-3.5"
        >
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-100">
              {transaction.description || "Sem descricao"}
            </span>
            <span className="text-base font-medium text-gray-100">
              {formatValue(transaction.value)}
            </span>
            <span className="text-xs text-gray-200">{formatDate(transaction.date)}</span>
            <span className="text-xs text-gray-200">
              Categoria: {transaction.categoryName || "Sem categoria"}
            </span>
            {transaction.notes ? (
              <span className="text-xs text-gray-200">{transaction.notes}</span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`rounded px-3 py-1 text-sm font-medium ${
                transaction.type === CATEGORY_ENTRY
                  ? "bg-brand-3 text-brand-1"
                  : "bg-gray-400 text-gray-100"
              }`}
            >
              {transaction.type}
            </span>
            <button
              type="button"
              onClick={() => onEdit(transaction)}
              className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-200 transition-colors hover:border-gray-200 hover:text-gray-100"
              aria-label={`Editar transacao ${transaction.id}`}
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => onDelete(transaction.id)}
              className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-200 transition-colors hover:border-gray-200 hover:text-gray-100"
              aria-label={`Excluir transacao ${transaction.id}`}
            >
              Excluir
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

TransactionList.propTypes = {
  transactions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      value: PropTypes.number.isRequired,
      type: PropTypes.string.isRequired,
      date: PropTypes.string.isRequired,
      categoryName: PropTypes.string,
      description: PropTypes.string,
      notes: PropTypes.string,
    }),
  ).isRequired,
  onDelete: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
};

export default TransactionList;
