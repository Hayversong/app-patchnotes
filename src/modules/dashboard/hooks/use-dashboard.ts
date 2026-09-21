import { useQuery } from "@tanstack/react-query";

import { getActivityHeatmap, getDashboardMetrics, getEntriesByTag, getTokenUsage } from "@/modules/dashboard/services/dashboard.service";

export function useDashboardMetrics() {
  return useQuery({ queryKey: ["dashboard", "metrics"], queryFn: getDashboardMetrics });
}

export function useActivityHeatmap() { return useQuery({ queryKey: ["dashboard", "activity-heatmap"], queryFn: getActivityHeatmap }); }
export function useTokenUsage(period: "7d" | "30d") { return useQuery({ queryKey: ["dashboard", "token-usage", period], queryFn: () => getTokenUsage(period) }); }
export function useEntriesByTag() { return useQuery({ queryKey: ["dashboard", "entries-by-tag"], queryFn: getEntriesByTag }); }
