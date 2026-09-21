export type DevlogEntry = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
};

export type DevlogEntriesResponse = { entries: DevlogEntry[] };

export type CreateDevlogRequest = {
  title: string;
  content: string;
  tags?: string[];
};

export type CreateDevlogResponse = { entry: DevlogEntry };
