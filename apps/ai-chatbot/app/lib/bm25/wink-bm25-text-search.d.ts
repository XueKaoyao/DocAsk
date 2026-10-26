declare module 'wink-bm25-text-search' {
  export type WinkOvFields = {
    snippet?: string;
    title?: string;
    documentId?: string;
    filename?: string;
    page?: number;
    index?: number;
    [key: string]: unknown;
  };

  export interface WinkBm25Engine {
    defineConfig(config: {
      fldWeights: Record<string, number>;
      bm25Params?: { k1?: number; b?: number; k?: number };
      ovFldNames?: string[];
    }): void;
    definePrepTasks(
      tasks: Array<(text: string) => string[]>,
      field?: string,
    ): number;
    addDoc(doc: Record<string, unknown>, uniqueId: string | number): void;
    consolidate(fp?: number): void;
    search(
      text: string,
      limit?: number,
      filter?: (ovFields: WinkOvFields, params: unknown) => boolean,
      params?: unknown,
    ): Array<[string | number, number]>;
    reset(): void;
    exportJSON(): string;
    importJSON(json: string): void;
    getTotalDocs(): number;
    /** token → 内部编号（词典） */
    getTokens(): Record<string, number>;
    /** 内部编号 → IDF */
    getIDF(): number[] | Record<number, number>;
    getDocs(): unknown;
    getTotalCorpusLength(): number;
  }

  function bm25(): WinkBm25Engine;
  export = bm25;
}
