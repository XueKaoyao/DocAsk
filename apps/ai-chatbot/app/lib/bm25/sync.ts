import type { LanceChunkRow } from '@/app/lib/lancedb';
import { clearCorpus, removeCorpusByDocumentId, upsertCorpus } from './corpus';
import { scheduleRebuild, flushRebuild } from './winkEngine';

/** LanceDB 写入成功后同步 BM25 语料并安排重建 */
export async function onChunksUpserted(rows: LanceChunkRow[]): Promise<void> {
  await upsertCorpus(rows);
  scheduleRebuild();
}

/** 按 documentId 删除后同步语料 */
export async function onChunksDeletedByDocumentId(
  documentId: string,
): Promise<void> {
  await removeCorpusByDocumentId(documentId);
  scheduleRebuild();
}

/** 清空 chunks 表时清空 BM25 */
export async function onChunksTableDropped(): Promise<void> {
  await clearCorpus();
  await flushRebuild();
}
