export type DocumentResponse = {
  id: string;
  title: string;
  filename: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type DocumentWriteInput = {
  title: string;
  content: string;
  filename?: string;
};

export type DocumentUpdateInput = {
  id: string;
  title?: string;
  content?: string;
  filename?: string;
};
