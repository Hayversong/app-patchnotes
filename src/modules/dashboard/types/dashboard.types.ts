export type DashboardMetrics = {
  totalEntries: number;
  tokensUsed: number;
  activeTime: string;
  messagesExchanged: number;
  streak: number;
};

export type ActivityDay = { date: string; count: number };
export type TokenUsagePoint = { date: string; tokens: number };
export type EntriesByTag = { tag: string; count: number };
