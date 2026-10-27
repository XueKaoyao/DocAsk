import { prisma } from '@/app/lib/prisma';
import type { Document } from '@/app/generated/prisma/client';
import { Prisma } from '@/app/generated/prisma/client';
import {
  clearAllChunks,
  indexDocumentChunks,
  removeDocumentChunks,
  type DocumentPage,
} from '@/app/lib/chunks';

export type CreateDocumentInput = {
  title: string;
  content: string;
  /** 原始文件名；缺省时回退为 title */
  filename?: string;
  /**
   * 可选分页正文。若提供，索引时按页切块并写入真实 page。
   * PDF 上传在后续步骤传入；纯文本可不传。
   */
  pages?: DocumentPage[];
};

export type UpdateDocumentInput = {
  id: string;
  title?: string;
  content?: string;
  filename?: string;
  pages?: DocumentPage[];
};

export class DocumentNotFoundError extends Error {
  constructor(id: string) {
    super(`Document not found: ${id}`);
    this.name = 'DocumentNotFoundError';
  }
}

function assertNonEmpty(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
}

/** 获取所有未软删除的 Document */
export async function getAllDocuments(): Promise<Document[]> {
  return prisma.document.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

/** 获取所有已软删除的 Document */
export async function getAllDeletedDocuments(): Promise<Document[]> {
  return prisma.document.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: 'desc' },
  });
}

/** 写入单条 Document，并同步切分向量写入 LanceDB */
export async function createDocument(
  input: CreateDocumentInput,
): Promise<Document> {
  assertNonEmpty(input.title, 'title');
  assertNonEmpty(input.content, 'content');

  const title = input.title.trim();
  const filename = (input.filename?.trim() || title).trim();

  const document = await prisma.document.create({
    data: {
      title,
      filename,
      content: input.content.trim(),
    },
  });

  await indexDocumentChunks(document, { pages: input.pages });
  return document;
}

/** 批量写入 Document，并同步切分向量写入 LanceDB */
export async function createDocuments(
  inputs: CreateDocumentInput[],
): Promise<Document[]> {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new Error('documents must be a non-empty array');
  }

  const documents: Document[] = [];
  for (let index = 0; index < inputs.length; index++) {
    const item = inputs[index];
    assertNonEmpty(item?.title, `documents[${index}].title`);
    assertNonEmpty(item?.content, `documents[${index}].content`);
    documents.push(
      await createDocument({
        title: item.title,
        content: item.content,
        filename: item.filename,
        pages: item.pages,
      }),
    );
  }
  return documents;
}

/** 更新 Document；正文或分页变化时重建 LanceDB 向量 */
export async function updateDocument(
  input: UpdateDocumentInput,
): Promise<Document> {
  assertNonEmpty(input.id, 'id');
  const id = input.id.trim();

  const data: {
    title?: string;
    content?: string;
    filename?: string;
  } = {};

  if (input.title !== undefined) {
    assertNonEmpty(input.title, 'title');
    data.title = input.title.trim();
  }
  if (input.content !== undefined) {
    assertNonEmpty(input.content, 'content');
    data.content = input.content.trim();
  }
  if (input.filename !== undefined) {
    assertNonEmpty(input.filename, 'filename');
    data.filename = input.filename.trim();
  }

  if (Object.keys(data).length === 0 && input.pages === undefined) {
    throw new Error(
      'at least one of title, content, filename, pages is required',
    );
  }

  try {
    const document = await prisma.document.update({
      where: { id },
      data,
    });

    const shouldReindex =
      input.content !== undefined ||
      input.pages !== undefined ||
      input.title !== undefined ||
      input.filename !== undefined;

    if (shouldReindex) {
      await removeDocumentChunks(id);
      await indexDocumentChunks(document, { pages: input.pages });
    }

    return document;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new DocumentNotFoundError(id);
    }
    throw error;
  }
}

/** 按 id 软删除 Document，并清理 LanceDB 向量；再次删除则硬删除 */
export async function deleteDocument(id: string): Promise<Document> {
  assertNonEmpty(id, 'id');
  const trimmed = id.trim();
  const document = await prisma.document.findUnique({
    where: { id: trimmed },
  });
  if (!document) {
    throw new DocumentNotFoundError(id);
  }

  if (!document.deletedAt) {
    await removeDocumentChunks(trimmed);
    return prisma.document.update({
      where: { id: trimmed },
      data: { deletedAt: new Date() },
    });
  }

  try {
    await removeDocumentChunks(trimmed);
    return await prisma.document.delete({
      where: { id: trimmed },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new DocumentNotFoundError(id);
    }
    throw error;
  }
}

/** 从回收站恢复 Document，并重新写入向量 */
export async function restoreDocument(id: string): Promise<Document> {
  assertNonEmpty(id, 'id');
  const trimmed = id.trim();

  const document = await prisma.document.findUnique({
    where: { id: trimmed },
  });
  if (!document) {
    throw new DocumentNotFoundError(id);
  }
  if (!document.deletedAt) {
    throw new Error('Document is not deleted');
  }

  const restored = await prisma.document.update({
    where: { id: trimmed },
    data: { deletedAt: null },
  });
  await indexDocumentChunks(restored);
  return restored;
}

/** 按 id 列表批量删除 */
/**
 * 批量删除：未软删的先软删并清向量；已在回收站的则硬删。
 * 返回本次处理条数（软删 + 硬删）。
 */
export async function deleteDocuments(
  ids: string[],
): Promise<{ count: number }> {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('ids must be a non-empty array');
  }

  const cleaned = ids.map((id, index) => {
    assertNonEmpty(id, `ids[${index}]`);
    return id.trim();
  });

  const existing = await prisma.document.findMany({
    where: { id: { in: cleaned } },
    select: { id: true, deletedAt: true },
  });

  const toSoftDelete = existing
    .filter((d) => d.deletedAt === null)
    .map((d) => d.id);
  const toHardDelete = existing
    .filter((d) => d.deletedAt !== null)
    .map((d) => d.id);

  for (const id of [...toSoftDelete, ...toHardDelete]) {
    await removeDocumentChunks(id);
  }

  let count = 0;

  if (toSoftDelete.length > 0) {
    const soft = await prisma.document.updateMany({
      where: { id: { in: toSoftDelete }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    count += soft.count;
  }

  if (toHardDelete.length > 0) {
    const hard = await prisma.document.deleteMany({
      where: { id: { in: toHardDelete }, deletedAt: { not: null } },
    });
    count += hard.count;
  }

  return { count };
}

/** 清空全部 Document，并清空 LanceDB chunks */
export async function deleteAllDocuments(): Promise<{ count: number }> {
  await clearAllChunks();
  return prisma.document.deleteMany();
}
