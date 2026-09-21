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

export type AuthResponse = {
  user: User;
  token: string;
};

export type CurrentUserResponse = {
  user: User;
};

export type RegisterRequest = {
  name: string;
  email: string;
  password: string;
};
