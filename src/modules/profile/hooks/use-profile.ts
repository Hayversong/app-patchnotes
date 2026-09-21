import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getProfile, updateProfile } from "@/modules/profile/services/profile.service";
import { useAuthStore } from "@/store/authStore";

export function useProfile() {
  return useQuery({ queryKey: ["profile"], queryFn: getProfile, select: (data) => data.user });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);
  return useMutation({
    mutationFn: updateProfile,
    onSuccess: ({ user }) => {
      setUser(user);
      queryClient.setQueryData(["profile"], { user });
    },
  });
}
