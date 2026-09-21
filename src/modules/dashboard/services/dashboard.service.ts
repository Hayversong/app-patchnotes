import { api } from "@/lib/axios";
import type { ActivityDay, DashboardMetrics, EntriesByTag, TokenUsagePoint } from "@/modules/dashboard/types/dashboard.types";

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const { data } = await api.get<DashboardMetrics>("/dashboard/metrics");
  return data;
}

export async function getActivityHeatmap(): Promise<{ days: ActivityDay[] }> {
  const { data } = await api.get<{ days: ActivityDay[] }>("/dashboard/activity-heatmap");
  return data;
}

export async function getTokenUsage(period: "7d" | "30d"): Promise<{ points: TokenUsagePoint[] }> {
  const { data } = await api.get<{ points: TokenUsagePoint[] }>("/dashboard/token-usage", { params: { period } });
  return data;
}

export async function getEntriesByTag(): Promise<{ tags: EntriesByTag[] }> {
  const { data } = await api.get<{ tags: EntriesByTag[] }>("/dashboard/entries-by-tag");
  return data;
}
