import { api } from "@/lib/axios";
import type { ProfileResponse, UpdateProfileRequest } from "@/modules/profile/types/profile.types";

export async function getProfile(): Promise<ProfileResponse> {
  const { data } = await api.get<ProfileResponse>("/profile");
  return data;
}

export async function updateProfile(payload: UpdateProfileRequest): Promise<ProfileResponse> {
  const { data } = await api.patch<ProfileResponse>("/profile", payload);
  return data;
}
