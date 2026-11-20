export type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

/** O access token não vem no corpo: a API o grava num cookie HttpOnly. */
export type AuthResponse = {
  user: User;
};

export type VerifyEmailRequest = { token: string };

export type CurrentUserResponse = {
  user: User;
};

export type RegisterRequest = {
  name: string;
  email: string;
  password: string;
};

export type ForgotPasswordRequest = { email: string };

export type ResetPasswordRequest = { token: string; password: string };

export type MessageResponse = { message: string };
