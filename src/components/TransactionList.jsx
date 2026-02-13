import PropTypes from "prop-types";
import { CATEGORY_ENTRY } from "./DatabaseUtils";

const formatValue = (value) => `R$ ${value.toFixed(2)}`;

const TransactionList = ({ transactions, onDelete }) => {
  return (
    <div className="mx-auto max-w-700 px-2 sm:px-0">
      {transactions.map((transaction) => (
        <div
          key={transaction.id}
          className="my-2 flex items-center justify-between rounded border border-brand-1 bg-gray-mode p-3.5"
        >
          <span className="text-base font-medium text-gray-100">
            {formatValue(transaction.value)}
          </span>

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
    }),
  ).isRequired,
  onDelete: PropTypes.func.isRequired,
};

export default TransactionList;
