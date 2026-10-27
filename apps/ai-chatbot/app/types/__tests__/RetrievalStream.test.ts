import { buildRetrievalDataPartId } from '../RetrievalType';
import type { RetrievalStreamEvent } from '../RetrievalType';

describe('buildRetrievalDataPartId', () => {
  it('uses toolCallId for start/done', () => {
    const start: RetrievalStreamEvent = {
      type: 'start',
      toolCallId: 'call_1',
      question: 'q',
    };
    const done: RetrievalStreamEvent = {
      type: 'done',
      toolCallId: 'call_1',
      count: 0,
      titles: [],
    };
    expect(buildRetrievalDataPartId(start)).toBe('call_1');
    expect(buildRetrievalDataPartId(done)).toBe('call_1');
  });

  it('uses toolCallId-index for hit', () => {
    const hit: RetrievalStreamEvent = {
      type: 'hit',
      toolCallId: 'call_1',
      index: 2,
      hit: {
        title: 't',
        filename: 'f',
        page: 0,
        snippet: 's',
        score: 0.1,
      },
    };
    expect(buildRetrievalDataPartId(hit)).toBe('call_1-2');
  });

  it('falls back for error without toolCallId', () => {
    const err: RetrievalStreamEvent = {
      type: 'error',
      message: 'boom',
    };
    expect(buildRetrievalDataPartId(err)).toBe('retrieval-error');
  });
});
