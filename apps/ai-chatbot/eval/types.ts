/**
 * RAG 评测集类型（与 eval/datasets/rag-gold.json 对齐）
 */
export type RagEvalDifficulty = 'easy' | 'medium' | 'hard';

export type RagEvalCase = {
  id: string;
  category: string;
  difficulty: RagEvalDifficulty;
  /** 用户问题（也可作为检索 query） */
  query: string;
  /**
   * 应召回的文档标题（与 Document.title / hit.title 对齐）。
   * expectInKb=false 时为空数组。
   */
  relevantTitles: string[];
  /** 知识库是否应能回答 */
  expectInKb: boolean;
  /** 标准答案（生成评测金标准） */
  answer: string;
  /** 采分点：便于人工/自动判分（覆盖即可，不必逐字相同） */
  answerKeyPoints: string[];
};

export type RagGoldDataset = {
  version: string;
  description: string;
  idField: 'title';
  notes: string[];
  cases: RagEvalCase[];
};
