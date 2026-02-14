import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import {
  CATEGORY_ENTRY,
  CATEGORY_EXIT,
  getTodayISODate,
  isValidISODate,
  parseCurrencyInput,
} from "./DatabaseUtils";

const formatValueForInput = (value) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "";
  }

  return numericValue.toFixed(2).replace(".", ",");
};

const Modal = ({ isOpen, onClose, onSave, initialTransaction = null }) => {
  const [value, setValue] = useState("");
  const [category, setCategory] = useState(CATEGORY_ENTRY);
  const [transactionDate, setTransactionDate] = useState(getTodayISODate());
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const isEditing = Boolean(initialTransaction);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setValue(
      initialTransaction ? formatValueForInput(initialTransaction.value) : "",
    );
    setCategory(initialTransaction?.type || CATEGORY_ENTRY);
    setTransactionDate(initialTransaction?.date || getTodayISODate());
    setDescription(initialTransaction?.description || "");
    setNotes(initialTransaction?.notes || "");
    setErrorMessage("");
  }, [initialTransaction, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleSubmit = (event) => {
    event.preventDefault();

    const parsedValue = parseCurrencyInput(value);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      setErrorMessage("Digite um valor valido maior que zero.");
      return;
    }

    if (!isValidISODate(transactionDate)) {
      setErrorMessage("Selecione uma data valida.");
      return;
    }

    onSave({
      value: parsedValue,
      type: category,
      date: transactionDate,
      description: description.trim(),
      notes: notes.trim(),
    });
  };

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-screen items-start justify-center bg-gray-100 bg-opacity-50 p-6 sm:items-center"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">
            {isEditing ? "Editar transacao" : "Registro de valor"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-200 transition-colors hover:text-gray-100"
            aria-label="Fechar modal"
          >
            X
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-200">
          {isEditing
            ? "Atualize os campos da transacao."
            : "Digite o valor, selecione o tipo e a data da transacao."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="valor" className="text-sm font-medium text-gray-100">
              Valor
            </label>
            <div className="flex items-center rounded border border-gray-400 px-4 py-2">
              <span className="text-sm font-medium text-gray-200">R$</span>
              <input
                id="valor"
                className="w-full pl-2 text-sm text-gray-200 outline-none"
                name="valor"
                placeholder="0,00"
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setErrorMessage("");
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="data" className="text-sm font-medium text-gray-100">
              Data
            </label>
            <input
              id="data"
              type="date"
              className="rounded border border-gray-400 px-3 py-2 text-sm text-gray-200"
              value={transactionDate}
              onChange={(event) => {
                setTransactionDate(event.target.value);
                setErrorMessage("");
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="descricao" className="text-sm font-medium text-gray-100">
              Descricao
            </label>
            <input
              id="descricao"
              type="text"
              className="rounded border border-gray-400 px-3 py-2 text-sm text-gray-200"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setErrorMessage("");
              }}
              placeholder="Ex.: Mercado, Salario, Aluguel"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="observacoes" className="text-sm font-medium text-gray-100">
              Observacoes
            </label>
            <textarea
              id="observacoes"
              className="min-h-20 rounded border border-gray-400 px-3 py-2 text-sm text-gray-200"
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                setErrorMessage("");
              }}
              placeholder="Detalhes opcionais da transacao"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-sm font-medium text-gray-100">Tipo de valor</span>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <button
                type="button"
                className={`rounded border px-3.5 py-1 text-sm font-semibold transition-colors ${
                  category === CATEGORY_ENTRY
                    ? "border-brand-1 bg-brand-3 text-brand-1"
                    : "border-gray-300 bg-white text-gray-200"
                }`}
                onClick={() => setCategory(CATEGORY_ENTRY)}
              >
                Entrada
              </button>
              <button
                type="button"
                className={`rounded border px-3.5 py-1 text-sm font-semibold transition-colors ${
                  category === CATEGORY_EXIT
                    ? "border-brand-1 bg-brand-3 text-brand-1"
                    : "border-gray-300 bg-white text-gray-200"
                }`}
                onClick={() => setCategory(CATEGORY_EXIT)}
              >
                Saida
              </button>
            </div>
          </div>

          {errorMessage ? (
            <p className="text-sm text-red-600" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              className="rounded border border-gray-300 bg-gray-400 px-3.5 py-1.5 text-sm font-semibold text-gray-200"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded border border-brand-1 bg-brand-1 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-2"
            >
              {isEditing ? "Salvar alteracoes" : "Inserir valor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  initialTransaction: PropTypes.shape({
    id: PropTypes.number.isRequired,
    value: PropTypes.number.isRequired,
    type: PropTypes.string.isRequired,
    date: PropTypes.string.isRequired,
    description: PropTypes.string,
    notes: PropTypes.string,
  }),
};

export default Modal;
