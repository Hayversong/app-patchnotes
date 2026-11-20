import { api } from "@/lib/axios";
import type {
  AuthResponse,
  CurrentUserResponse,
  ForgotPasswordRequest,
  LoginRequest,
  MessageResponse,
  RegisterRequest,
  ResetPasswordRequest,
  VerifyEmailRequest,
} from "@/modules/auth/types/auth.types";

// Rotas de autenticação não disparam refresh automático num 401 (ver src/lib/axios.ts).
const authRoute = { skipAuthRefresh: true } as const;

export async function login(payload: LoginRequest): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/login", payload, authRoute);
  return data;
}

/** Pede o cadastro: a API responde sempre 202 e manda o link de confirmação por e-mail. */
export async function register(payload: RegisterRequest): Promise<MessageResponse> {
  const { data } = await api.post<MessageResponse>("/auth/register", payload, authRoute);
  return data;
}

/** Confirma o cadastro com o token do link; a conta é criada e a sessão aberta (cookies HttpOnly). */
export async function verifyEmail(payload: VerifyEmailRequest): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/verify-email", payload, authRoute);
  return data;
}

export async function getCurrentUser(): Promise<CurrentUserResponse> {
  const { data } = await api.get<CurrentUserResponse>("/auth/me");
  return data;
}

/** Revoga a sessão no servidor (refresh token no cookie httpOnly). */
export async function logout(): Promise<void> {
  await api.post("/auth/logout", undefined, authRoute);
}

export async function forgotPassword(payload: ForgotPasswordRequest): Promise<MessageResponse> {
  const { data } = await api.post<MessageResponse>("/auth/forgot-password", payload, authRoute);
  return data;
}

export async function resetPassword(payload: ResetPasswordRequest): Promise<void> {
  await api.post("/auth/reset-password", payload, authRoute);
}
