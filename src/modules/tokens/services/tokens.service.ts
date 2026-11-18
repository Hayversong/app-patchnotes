import { api } from "@/lib/axios";
import type { RechargeResponse, TokenBalance, TokenHistoryResponse } from "@/modules/tokens/types/tokens.types";

export async function getTokenBalance(): Promise<TokenBalance> {
  const { data } = await api.get<TokenBalance>("/tokens/balance");
  return data;
}

export async function getTokenHistory(limit = 20): Promise<TokenHistoryResponse> {
  const { data } = await api.get<TokenHistoryResponse>("/tokens/history", { params: { limit } });
  return data;
}

/** Recarga simulada: soma um pacote de tokens ao saldo do mês, sem cobrança. */
export async function rechargeTokens(amount: number): Promise<RechargeResponse> {
  const { data } = await api.post<RechargeResponse>("/tokens/recharge", { amount });
  return data;
}
