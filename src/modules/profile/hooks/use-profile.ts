import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { deleteAvatar, getProfile, updateProfile, uploadAvatar } from "@/modules/profile/services/profile.service";
import type { ProfileResponse } from "@/modules/profile/types/profile.types";
import { useAuthStore } from "@/store/authStore";

export function useProfile() {
  return useQuery({ queryKey: ["profile"], queryFn: getProfile, select: (data) => data.user });
}

/** Grava o perfil devolvido pela API no cache e na sessão (a barra lateral mostra nome e foto). */
function useApplyProfile() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);
  return ({ user }: ProfileResponse) => {
    setUser(user);
    queryClient.setQueryData(["profile"], { user });
  };
}

export function useUpdateProfile() {
  return useMutation({ mutationFn: updateProfile, onSuccess: useApplyProfile() });
}

export function useUploadAvatar() {
  return useMutation({ mutationFn: uploadAvatar, onSuccess: useApplyProfile() });
}

export function useDeleteAvatar() {
  return useMutation({ mutationFn: deleteAvatar, onSuccess: useApplyProfile() });
}
