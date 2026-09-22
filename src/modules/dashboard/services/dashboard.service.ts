import { api } from "@/lib/axios";
import type { ActivityHeatmapResponse, DashboardMetrics, EntriesByTagResponse, TokenUsageResponse } from "@/modules/dashboard/types/dashboard.types";

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const { data } = await api.get<DashboardMetrics>("/dashboard/metrics");
  return data;
}

export async function getActivityHeatmap(): Promise<ActivityHeatmapResponse> {
  const { data } = await api.get<ActivityHeatmapResponse>("/dashboard/activity-heatmap");
  return data;
}

export async function getTokenUsage(period: "7d" | "30d"): Promise<TokenUsageResponse> {
  const { data } = await api.get<TokenUsageResponse>("/dashboard/token-usage", { params: { period } });
  return data;
}

export async function getEntriesByTag(): Promise<EntriesByTagResponse> {
  const { data } = await api.get<EntriesByTagResponse>("/dashboard/entries-by-tag");
  return data;
}
