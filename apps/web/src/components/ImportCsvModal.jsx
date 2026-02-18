import { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { transactionsService } from "../services/transactions.service";

const getApiErrorMessage = (error, fallbackMessage) => {
  return error?.response?.data?.message || error?.message || fallbackMessage;
};

const formatCurrency = (value) => {
  return `R$ ${(Number(value) || 0).toFixed(2)}`;
};

const ImportCsvModal = ({ isOpen, onClose, onImported = undefined }) => {
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [dryRunResult, setDryRunResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setSelectedFile(null);
    setIsDryRunning(false);
    setIsCommitting(false);
    setDryRunResult(null);
    setErrorMessage("");
    setSuccessMessage("");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    fileInputRef.current?.focus();

    const handleEscapeKey = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscapeKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscapeKey);
    };
  }, [isOpen, onClose]);

  const hasValidRows = useMemo(() => {
    return (dryRunResult?.summary?.validRows || 0) > 0;
  }, [dryRunResult]);

  const handleDryRun = async () => {
    if (!selectedFile) {
      setErrorMessage("Selecione um arquivo CSV.");
      setSuccessMessage("");
      return;
    }

    setIsDryRunning(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const result = await transactionsService.dryRunImportCsv(selectedFile);
      setDryRunResult(result);
    } catch (error) {
      setDryRunResult(null);
      setErrorMessage(getApiErrorMessage(error, "Nao foi possivel processar o arquivo CSV."));
    } finally {
      setIsDryRunning(false);
    }
  };

  const handleCommit = async () => {
    if (!dryRunResult?.importId) {
      setErrorMessage("Rode a pre-visualizacao antes de importar.");
      return;
    }

    if (!hasValidRows) {
      setErrorMessage("Nao ha linhas validas para importar.");
      return;
    }

    setIsCommitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const commitResult = await transactionsService.commitImportCsv(dryRunResult.importId);

      if (onImported) {
        await onImported(commitResult);
        return;
      }

      setSuccessMessage(`Importacao concluida com sucesso (${commitResult.imported} linhas).`);
    } catch (error) {
      const apiMessage = getApiErrorMessage(error, "Nao foi possivel confirmar a importacao.");
      setErrorMessage(
        apiMessage === "Sessao de importacao expirada."
          ? "Sessao de importacao expirada. Rode a pre-visualizacao novamente."
          : apiMessage,
      );
    } finally {
      setIsCommitting(false);
    }
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
      <div
        className="w-full max-w-4xl rounded-lg bg-white p-4 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-csv-modal-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="import-csv-modal-title" className="text-lg font-semibold text-gray-800">
            Importar CSV
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 transition-colors hover:text-gray-700"
            aria-label="Fechar modal de importacao CSV"
          >
            X
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-600">
          Envie um CSV para pre-visualizar as linhas validas e confirmar a importacao.
        </p>

        <div className="rounded border border-gray-300 bg-white p-3">
          <label htmlFor="csv-file-input" className="mb-1 block text-sm font-medium text-gray-700">
            Arquivo CSV
          </label>
          <input
            ref={fileInputRef}
            id="csv-file-input"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const nextFile = event.target.files?.[0] || null;
              setSelectedFile(nextFile);
              setDryRunResult(null);
              setErrorMessage("");
              setSuccessMessage("");
            }}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded file:border file:border-gray-300 file:bg-gray-100 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-gray-700 hover:file:bg-gray-200"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDryRun}
            disabled={isDryRunning || isCommitting}
            className="rounded border border-brand-1 bg-brand-1 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDryRunning ? "Processando..." : "Pre-visualizar"}
          </button>
          <button
            type="button"
            onClick={handleCommit}
            disabled={!hasValidRows || isDryRunning || isCommitting}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCommitting ? "Importando..." : "Importar"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-700"
          >
            Fechar
          </button>
        </div>

        {errorMessage ? (
          <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {successMessage}
          </div>
        ) : null}

        {dryRunResult ? (
          <div className="mt-4 space-y-3">
            <div className="grid gap-2 sm:grid-cols-5">
              <div className="rounded border border-gray-300 bg-gray-400 px-3 py-2">
                <p className="text-xs font-medium uppercase text-gray-600">Total</p>
                <p className="text-sm font-semibold text-gray-800">{dryRunResult.summary.totalRows}</p>
              </div>
              <div className="rounded border border-gray-300 bg-gray-400 px-3 py-2">
                <p className="text-xs font-medium uppercase text-gray-600">Validas</p>
                <p className="text-sm font-semibold text-gray-800">{dryRunResult.summary.validRows}</p>
              </div>
              <div className="rounded border border-gray-300 bg-gray-400 px-3 py-2">
                <p className="text-xs font-medium uppercase text-gray-600">Invalidas</p>
                <p className="text-sm font-semibold text-gray-800">{dryRunResult.summary.invalidRows}</p>
              </div>
              <div className="rounded border border-gray-300 bg-gray-400 px-3 py-2">
                <p className="text-xs font-medium uppercase text-gray-600">Entradas</p>
                <p className="text-sm font-semibold text-gray-800">
                  {formatCurrency(dryRunResult.summary.income)}
                </p>
              </div>
              <div className="rounded border border-gray-300 bg-gray-400 px-3 py-2">
                <p className="text-xs font-medium uppercase text-gray-600">Saidas</p>
                <p className="text-sm font-semibold text-gray-800">
                  {formatCurrency(dryRunResult.summary.expense)}
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-600">
              Sessao expira em: {dryRunResult.expiresAt || "nao informado"}
            </p>

            {dryRunResult.rows.length === 0 ? (
              <div className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600">
                Sem linhas para pre-visualizar.
              </div>
            ) : (
              <div className="max-h-80 overflow-auto rounded border border-gray-300">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead className="bg-gray-400">
                    <tr>
                      <th className="border-b border-gray-300 px-2 py-2 text-gray-700">Linha</th>
                      <th className="border-b border-gray-300 px-2 py-2 text-gray-700">Status</th>
                      <th className="border-b border-gray-300 px-2 py-2 text-gray-700">Descricao</th>
                      <th className="border-b border-gray-300 px-2 py-2 text-gray-700">Valor</th>
                      <th className="border-b border-gray-300 px-2 py-2 text-gray-700">Data</th>
                      <th className="border-b border-gray-300 px-2 py-2 text-gray-700">Categoria</th>
                      <th className="border-b border-gray-300 px-2 py-2 text-gray-700">Erros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dryRunResult.rows.map((row) => (
                      <tr key={`import-row-${row.line}`} className="align-top">
                        <td className="border-b border-gray-300 px-2 py-2 text-gray-700">{row.line}</td>
                        <td className="border-b border-gray-300 px-2 py-2">
                          <span
                            className={`rounded px-2 py-0.5 font-semibold ${
                              row.status === "valid"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {row.status === "valid" ? "Valida" : "Invalida"}
                          </span>
                        </td>
                        <td className="border-b border-gray-300 px-2 py-2 text-gray-700">
                          {row.raw.description || "-"}
                        </td>
                        <td className="border-b border-gray-300 px-2 py-2 text-gray-700">
                          {row.raw.value || "-"}
                        </td>
                        <td className="border-b border-gray-300 px-2 py-2 text-gray-700">{row.raw.date || "-"}</td>
                        <td className="border-b border-gray-300 px-2 py-2 text-gray-700">
                          {row.raw.category || "Sem categoria"}
                        </td>
                        <td className="border-b border-gray-300 px-2 py-2 text-gray-700">
                          {row.errors.length > 0
                            ? row.errors.map((error) => error.message).join(" | ")
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

ImportCsvModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onImported: PropTypes.func,
};

export default ImportCsvModal;
