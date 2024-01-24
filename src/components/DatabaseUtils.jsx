// Função para somar todos os valores de um array
export const sumValues = (array) => {
    return array.reduce((acc, current) => acc + current.value, 0);
  };
  
  // Função para filtrar os registros por categoria
  export const filterByCategory = (transactions, category) => {
    if (category === "Todos") {
      return transactions;
    } else {
      return transactions.filter((transaction) => transaction.type === category);
    }
  };
  

  
  