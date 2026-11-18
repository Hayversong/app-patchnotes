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

/** Envia a foto como bytes crus, com o tipo do arquivo. */
export async function uploadAvatar(file: File): Promise<ProfileResponse> {
  const { data } = await api.put<ProfileResponse>("/profile/avatar", file, { headers: { "Content-Type": file.type } });
  return data;
}

export async function deleteAvatar(): Promise<ProfileResponse> {
  const { data } = await api.delete<ProfileResponse>("/profile/avatar");
  return data;
}
