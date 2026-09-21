import { api } from "@/lib/axios";
import type {
  CreateDevlogRequest,
  CreateDevlogResponse,
  DevlogEntriesResponse,
} from "@/modules/devlog/types/devlog.types";

export async function getDevlogEntries(): Promise<DevlogEntriesResponse> {
  const { data } = await api.get<DevlogEntriesResponse>("/devlog/entries");
  return data;
}

export async function createDevlogEntry(payload: CreateDevlogRequest): Promise<CreateDevlogResponse> {
  const { data } = await api.post<CreateDevlogResponse>("/devlog/entries", payload);
  return data;
}
