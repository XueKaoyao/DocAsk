import { useCallback } from 'react';
import { apiFetch } from '@myworkspace/fetch';
import type {
  DocumentResponse,
  DocumentUpdateInput,
  DocumentWriteInput,
} from '../types/DocumentsType';

interface DocumentState {
  getDocuments: () => Promise<DocumentResponse[]>;
  getDeletedDocuments: () => Promise<DocumentResponse[]>;
  getDocument: (id: string) => Promise<DocumentResponse | undefined>;
  createDocument: (input: DocumentWriteInput) => Promise<DocumentResponse>;
  updateDocument: (input: DocumentUpdateInput) => Promise<DocumentResponse>;
  restoreDocument: (id: string) => Promise<DocumentResponse>;
  deleteDocument: (id: string) => Promise<DocumentResponse>;
  deleteDocuments: (ids: string[]) => Promise<number>;
}

export const useDocumentCrud = (): DocumentState => {
  const getDocuments = useCallback(async () => {
    return apiFetch<DocumentResponse[]>('/api/documents', {
      cacheConfig: { ttl: 0 },
    });
  }, []);

  const getDeletedDocuments = useCallback(async () => {
    return apiFetch<DocumentResponse[]>('/api/documents?deleted=1', {
      cacheConfig: { ttl: 0 },
    });
  }, []);

  const getDocument = useCallback(
    async (id: string) => {
      const list = await getDocuments();
      return list.find((d) => d.id === id);
    },
    [getDocuments],
  );

  const createDocument = useCallback(async (input: DocumentWriteInput) => {
    const response = await apiFetch<{ document: DocumentResponse }>(
      '/api/documents',
      {
        method: 'POST',
        data: input,
        cacheConfig: { ttl: 0 },
      },
    );
    return response.document;
  }, []);

  const updateDocument = useCallback(async (input: DocumentUpdateInput) => {
    const response = await apiFetch<{ document: DocumentResponse }>(
      '/api/documents',
      {
        method: 'PUT',
        data: input,
        cacheConfig: { ttl: 0 },
      },
    );
    return response.document;
  }, []);

  const restoreDocument = useCallback(async (id: string) => {
    const response = await apiFetch<{ document: DocumentResponse }>(
      '/api/documents',
      {
        method: 'PUT',
        data: { id, restore: true },
        cacheConfig: { ttl: 0 },
      },
    );
    return response.document;
  }, []);

  const deleteDocument = useCallback(async (id: string) => {
    const response = await apiFetch<{ document: DocumentResponse }>(
      '/api/documents',
      {
        method: 'DELETE',
        data: { id },
        cacheConfig: { ttl: 0 },
      },
    );
    return response.document;
  }, []);

  const deleteDocuments = useCallback(async (ids: string[]) => {
    const response = await apiFetch<{ deleted: number }>('/api/documents', {
      method: 'DELETE',
      data: { ids },
      cacheConfig: { ttl: 0 },
    });
    return response.deleted;
  }, []);

  return {
    getDocuments,
    getDeletedDocuments,
    getDocument,
    createDocument,
    updateDocument,
    restoreDocument,
    deleteDocument,
    deleteDocuments,
  };
};
