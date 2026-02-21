import { api } from "./api";

export interface TrendPoint {
  month: string;
  income: number;
  expense: number;
  balance: number;
}

interface TrendPointApiResponse {
  month?: unknown;
  income?: unknown;
  expense?: unknown;
  balance?: unknown;
}

const normalizeTrendPoint = (item: TrendPointApiResponse): TrendPoint => ({
  month: typeof item?.month === "string" && item.month.trim() ? item.month.trim() : "",
  income: Number(item?.income) || 0,
  expense: Number(item?.expense) || 0,
  balance: Number(item?.balance) || 0,
});

export const analyticsService = {
  getMonthlyTrend: async (months: number = 6): Promise<TrendPoint[]> => {
    const { data } = await api.get("/analytics/trend", {
      params: { months: String(months) },
    });

    if (!Array.isArray(data)) {
      return [];
    }

    return (data as TrendPointApiResponse[])
      .map(normalizeTrendPoint)
      .filter((point) => Boolean(point.month));
  },
};
