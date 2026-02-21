import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "../services/analytics.service";

const formatCurrency = (value: number) => `R$ ${Number(value || 0).toFixed(2)}`;

const MONTH_NAMES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const formatMonthLabel = (value: string): string => {
  if (typeof value !== "string" || !value) return value;
  const [year, month] = value.split("-");
  const monthIndex = Number(month) - 1;
  if (!year || monthIndex < 0 || monthIndex > 11) return value;
  return `${MONTH_NAMES_PT[monthIndex]}/${year.slice(2)}`;
};

interface TooltipEntry {
  dataKey?: string;
  name?: string;
  value?: number;
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded border border-gray-300 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-semibold text-gray-900">{formatMonthLabel(String(label || ""))}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(Number(entry.value || 0))}
        </p>
      ))}
    </div>
  );
};

interface ChartClickData {
  activeLabel?: string;
}

interface TrendChartProps {
  data: TrendPoint[];
  onMonthClick?: (month: string) => void;
  selectedMonth?: string;
}

const TrendChart = ({ data, onMonthClick, selectedMonth }: TrendChartProps) => {
  const hasAnyValue = data.some(
    (point) => point.income > 0 || point.expense > 0 || point.balance !== 0,
  );

  if (!hasAnyValue) {
    return (
      <div className="rounded border border-brand-1 bg-gray-500 p-4 text-center text-sm text-gray-100">
        Sem dados suficientes para exibir a evolucao historica.
      </div>
    );
  }

  const isSelectedInRange = selectedMonth
    ? data.some((point) => point.month === selectedMonth)
    : false;

  return (
    <div className="rounded border border-brand-1 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-100">
        Evolucao (ultimos 6 meses)
        {onMonthClick && (
          <span className="ml-2 text-xs font-normal text-gray-300">
            — clique em um mes para navegar
          </span>
        )}
      </h3>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <LineChart
          data={data}
          margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
          onClick={(chartData: ChartClickData) => {
            const month = chartData?.activeLabel;
            if (typeof month === "string" && month && onMonthClick) {
              onMonthClick(month);
            }
          }}
          style={{ cursor: onMonthClick ? "pointer" : undefined }}
        >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" stroke="#495057" tickFormatter={formatMonthLabel} />
            <YAxis stroke="#495057" width={90} tickFormatter={formatCurrency} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {isSelectedInRange && (
              <ReferenceLine
                x={selectedMonth}
                stroke="#6741D9"
                strokeDasharray="4 2"
                strokeWidth={2}
                label={{ value: formatMonthLabel(selectedMonth!), fill: "#6741D9", fontSize: 11 }}
              />
            )}
            <Line
              type="monotone"
              dataKey="income"
              name="Entradas"
              stroke="#16a34a"
              dot={false}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="expense"
              name="Saidas"
              stroke="#dc2626"
              dot={false}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="balance"
              name="Saldo"
              stroke="#6741D9"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TrendChart;
