import PropTypes from "prop-types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const formatCurrency = (value) => `R$ ${value.toFixed(2)}`;

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const value = Number(payload[0].value || 0);

  return (
    <div className="rounded border border-gray-300 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-gray-100">{label}</p>
      <p className="text-gray-200">{formatCurrency(value)}</p>
    </div>
  );
};

CustomTooltip.propTypes = {
  active: PropTypes.bool,
  label: PropTypes.string,
  payload: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.number,
    }),
  ),
};

CustomTooltip.defaultProps = {
  active: false,
  label: "",
  payload: [],
};

const TransactionChart = ({ data }) => {
  const hasAnyValue = data.some((item) => item.total > 0);

  if (!hasAnyValue) {
    return (
      <div className="rounded border border-brand-1 bg-gray-500 p-4 text-center text-sm text-gray-100">
        Sem dados suficientes para exibir o grafico no periodo selecionado.
      </div>
    );
  }

  return (
    <div className="rounded border border-brand-1 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-100">
        Receita x Despesa no periodo
      </h3>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" stroke="#495057" />
            <YAxis stroke="#495057" width={90} tickFormatter={formatCurrency} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="total" fill="#6741D9" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

TransactionChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      total: PropTypes.number.isRequired,
    }),
  ).isRequired,
};

export default TransactionChart;
