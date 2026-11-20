export type Profile = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  bio?: string;
  githubUrl?: string;
};

export type ProfileResponse = { user: Profile };

/** avatarUrl é só de leitura: a foto é enviada em PUT /profile/avatar. */
export type UpdateProfileRequest = {
  name?: string;
  bio?: string;
  githubUrl?: string;
};
