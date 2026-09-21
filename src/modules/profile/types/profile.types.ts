export type Profile = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  bio?: string;
  githubUrl?: string;
};

export type ProfileResponse = { user: Profile };

export type UpdateProfileRequest = {
  name?: string;
  bio?: string;
  avatarUrl?: string;
  githubUrl?: string;
};
