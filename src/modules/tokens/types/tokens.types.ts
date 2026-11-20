export type TokenBalance = {
  /** Tokens ainda disponíveis no mês (cota + recargas - consumo). */
  balance: number;
  /** Cota mensal somada às recargas do mês. */
  limit: number;
  used: number;
  credits: number;
  periodStart: string;
  periodEnd: string;
};

export type TokenHistoryItem = {
  id: string;
  kind: "usage" | "recharge";
  amount: number;
  createdAt: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  estimated?: boolean;
};

export type TokenHistoryResponse = { items: TokenHistoryItem[]; packages: number[] };

export type RechargeResponse = TokenBalance & { recharged: number };
