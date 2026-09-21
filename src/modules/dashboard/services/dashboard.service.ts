import { api } from "@/lib/axios";
import type { DashboardMetrics } from "@/modules/dashboard/types/dashboard.types";

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const { data } = await api.get<DashboardMetrics>("/dashboard/metrics");
  return data;
}
