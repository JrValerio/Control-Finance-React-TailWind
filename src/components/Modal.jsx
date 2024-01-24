import React, { useState, useEffect } from "react";

const Modal = ({
    isOpen, 
    onClose, 
    onSave, 
    transaction, 
    onValueChange, 
    onTypeChange, 
    insertedValues,
    setInsertedValues,
    activeButton,
    setActiveButton,
    
}) => {
  const [value, setValue] = useState("");
  const [category, setCategory] = useState("Entrada");

  const handleTypeChange = (newCategory) => {
    setCategory(newCategory);
    setActiveButton(newCategory);
  };

  const handleSave = () => {
    const formattedValue = parseFloat(value.replace(',', '.'));
    const newEntry = {
      id: insertedValues.length > 0 ? Math.max(...insertedValues.map((item) => item.id)) + 1 : 1,
      value: isNaN(formattedValue) ? 0 : formattedValue,
      type: category,
    };
  
    setInsertedValues((prevValues) => [...prevValues, newEntry]);
    onSave(newEntry);  
    setValue("");
    setCategory("Entrada");
    onClose();
  };

  const handleOutsideClick = (event) => {
    if (event.target.id === "modal-backdrop") {
      onClose();
    }
  };

  useEffect(() => {
    setCategory(transaction.type || "Entrada"); 
  }, [transaction.type]);

  return isOpen ? (
    <div className="fixed min-h-screen inset-0 bg-gray-100 bg-opacity-50 overflow-y-auto w-full flex justify-center items-start sm:items-center p-6">
      <div className="bg-white rounded-lg max-w-md p-4 sm:p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">
            Registro de valor
          </h3>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-800"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        <p className="text-sm text-gray-200">
          Digite o valor e em seguida aperte no botão referente ao tipo do valor
        </p>
        <div className="flex flex-col justify-center items-start gap-2">
          <label htmlFor="valor" className="text-gray-900 text-sm font-medium">
            Valor
          </label>
          <div className="flex items-center border border-gray-400 rounded px-4 py-2 w-full">
            <span className="text-gray-600 text-sm font-medium">R$</span>
            <input
              id="valor"
              className="outline-none pl-2 w-full text-gray-600 text-sm font-normal"
              name="valor"
              placeholder="0,00"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <span className="text-gray-900 text-sm font-medium">
            Tipo de valor
          </span>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <button
              className={`px-3.5 py-1 bg-white rounded border border-gray-200 text-gray-600 text-sm font-semibold w-full sm:w-auto ... 
              ${
                category === "Entrada"
                  ? "ring-1 ring-offset-1 ring-brand-1"
                  : ""
              }`}
              onClick={() => handleTypeChange("Entrada")}
            >
              Entrada
            </button>
            <button
              className={`px-3.5 py-1 bg-white rounded border border-gray-200 text-gray-600 text-sm font-semibold w-full sm:w-auto ... 
              ${
                category === "Saída"
                  ? "ring-1 ring-offset-1 ring-brand-1"
                  : ""
              }`}
              onClick={() => handleTypeChange("Saída")}
            >
              Saída
            </button>
          </div>
        </div>
        <div className="flex justify-end items-end gap-4">
          <button
            className="w-1/2 sm:w-auto px-3.5 py-1.5 bg-gray-300 rounded border border-gray-300 text-gray-600 text-sm font-semibold "
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="w-1/2 sm:w-auto px-3.5 py-1.5 bg-purple-700 rounded border border-purple-700 text-white text-sm whitespace-nowrap font-semibold"
            onClick={handleSave}
          >
            Inserir valor
          </button>
        </div>
      </div>
    </div>
  ) : null;
};

export default Modal;
