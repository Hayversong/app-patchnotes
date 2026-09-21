import { useQuery } from "@tanstack/react-query";

import { getDashboardMetrics } from "@/modules/dashboard/services/dashboard.service";

export function useDashboardMetrics() {
  return useQuery({ queryKey: ["dashboard", "metrics"], queryFn: getDashboardMetrics });
}
