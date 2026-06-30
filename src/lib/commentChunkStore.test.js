import { describe, it, expect } from 'vitest';
import {
  chunkStorageKey,
  chunkIndexKey,
  chunkMigratedKey,
  splitIntoChunks,
  buildChunkIndex,
  isChunkIndex,
  chunkKeysFromIndex,
  planMigrateMainToChunks,
  planAppendRowsAsChunks,
  planRewriteAllChunks,
  readChunkedComments,
  DEFAULT_COMMENT_CHUNK_SIZE,
  CHUNK_INDEX_VERSION
} from './commentChunkStore.js';

describe('key builders', () => {
  it('チャンク/インデックス/移行フラグは別接頭辞で trim+小文字化', () => {
    expect(chunkStorageKey('LV1', 0)).toBe('nls_cchunk_lv1_0');
    expect(chunkStorageKey(' LV1 ', 3)).toBe('nls_cchunk_lv1_3');
    expect(chunkIndexKey('LV1')).toBe('nls_cchunk_index_lv1');
    expect(chunkMigratedKey('LV1')).toBe('nls_cchunk_migrated_lv1');
  });

  it('nls_comments_lv* 列挙と衝突しない', () => {
    for (const k of [
      chunkStorageKey('lv1', 0),
      chunkIndexKey('lv1'),
      chunkMigratedKey('lv1')
    ]) {
      expect(k.startsWith('nls_comments_')).toBe(false);
    }
  });
});

describe('splitIntoChunks', () => {
  it('maxPerChunk 件ずつに分割', () => {
    const arr = Array.from({ length: 5 }, (_, i) => i);
    expect(splitIntoChunks(arr, 2)).toEqual([[0, 1], [2, 3], [4]]);
  });
  it('空・非配列は空', () => {
    expect(splitIntoChunks([], 2)).toEqual([]);
    expect(splitIntoChunks(null, 2)).toEqual([]);
  });
  it('既定サイズを使う', () => {
    const arr = Array.from({ length: DEFAULT_COMMENT_CHUNK_SIZE + 1 }, (_, i) => i);
    const chunks = splitIntoChunks(arr);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(DEFAULT_COMMENT_CHUNK_SIZE);
    expect(chunks[1]).toHaveLength(1);
  });
});

describe('buildChunkIndex / isChunkIndex', () => {
  it('正規化したインデックスを作る', () => {
    const idx = buildChunkIndex('LV9', { seqs: [0, 1, 2], total: 2500, maxPerChunk: 1000 });
    expect(idx).toEqual({
      v: CHUNK_INDEX_VERSION,
      liveId: 'lv9',
      seqs: [0, 1, 2],
      total: 2500,
      maxPerChunk: 1000
    });
  });

  it('型ガードは破損・別 lv・旧版を弾く', () => {
    const idx = buildChunkIndex('lv1', { seqs: [0], total: 1 });
    expect(isChunkIndex(idx)).toBe(true);
    expect(isChunkIndex(idx, 'lv1')).toBe(true);
    expect(isChunkIndex(idx, 'lv2')).toBe(false);
    expect(isChunkIndex(null)).toBe(false);
    expect(isChunkIndex({ v: 999, seqs: [], total: 0 })).toBe(false);
    expect(isChunkIndex({ v: 1, seqs: 'x', total: 0 })).toBe(false);
  });
});

describe('chunkKeysFromIndex', () => {
  it('seq 昇順でキー化', () => {
    const idx = buildChunkIndex('lv1', { seqs: [2, 0, 1], total: 30 });
    expect(chunkKeysFromIndex('lv1', idx)).toEqual([
      'nls_cchunk_lv1_0',
      'nls_cchunk_lv1_1',
      'nls_cchunk_lv1_2'
    ]);
  });
});

describe('planMigrateMainToChunks', () => {
  it('main を分割し index を作る（main キーは含めない）', () => {
    const main = Array.from({ length: 5 }, (_, i) => ({ no: i }));
    const { writes, index } = planMigrateMainToChunks('lv1', main, { maxPerChunk: 2 });
    expect(Object.keys(writes).sort()).toEqual([
      'nls_cchunk_lv1_0',
      'nls_cchunk_lv1_1',
      'nls_cchunk_lv1_2'
    ]);
    expect(writes['nls_cchunk_lv1_0']).toHaveLength(2);
    expect(writes['nls_cchunk_lv1_2']).toHaveLength(1);
    expect(index.seqs).toEqual([0, 1, 2]);
    expect(index.total).toBe(5);
    // main キーは write しない（バックアップとして温存）
    expect('nls_comments_lv1' in writes).toBe(false);
  });

  it('空 main は空 index', () => {
    const { writes, index } = planMigrateMainToChunks('lv1', [], { maxPerChunk: 2 });
    expect(writes).toEqual({});
    expect(index.seqs).toEqual([]);
    expect(index.total).toBe(0);
  });
});

describe('planAppendRowsAsChunks', () => {
  it('既存チャンクを書き換えず、新 seq に追記する', () => {
    const index = buildChunkIndex('lv1', { seqs: [0, 1], total: 4, maxPerChunk: 2 });
    const added = [{ no: 10 }, { no: 11 }, { no: 12 }];
    const out = planAppendRowsAsChunks('lv1', index, added, { maxPerChunk: 2 });
    // 既存 seq 0,1 は writes に含まれない（不変）
    expect('nls_cchunk_lv1_0' in out.writes).toBe(false);
    expect('nls_cchunk_lv1_1' in out.writes).toBe(false);
    // 新 seq 2,3 が増える
    expect(out.writes['nls_cchunk_lv1_2']).toEqual([{ no: 10 }, { no: 11 }]);
    expect(out.writes['nls_cchunk_lv1_3']).toEqual([{ no: 12 }]);
    expect(out.index.seqs).toEqual([0, 1, 2, 3]);
    expect(out.index.total).toBe(7);
  });

  it('added が空なら writes 空・total 据え置き', () => {
    const index = buildChunkIndex('lv1', { seqs: [0], total: 2, maxPerChunk: 2 });
    const out = planAppendRowsAsChunks('lv1', index, [], { maxPerChunk: 2 });
    expect(out.writes).toEqual({});
    expect(out.index.total).toBe(2);
    expect(out.index.seqs).toEqual([0]);
  });

  it('空 index からの初回追記は seq 0 から', () => {
    const index = buildChunkIndex('lv1', { seqs: [], total: 0, maxPerChunk: 2 });
    const out = planAppendRowsAsChunks('lv1', index, [{ a: 1 }], { maxPerChunk: 2 });
    expect(out.writes['nls_cchunk_lv1_0']).toEqual([{ a: 1 }]);
    expect(out.index.seqs).toEqual([0]);
    expect(out.index.total).toBe(1);
  });
});

describe('planRewriteAllChunks', () => {
  it('全チャンクを書き直し、減った seq を removeKeys に挙げる', () => {
    const out = planRewriteAllChunks('lv1', [{ a: 1 }, { a: 2 }], {
      prevSeqs: [0, 1, 2],
      maxPerChunk: 2
    });
    expect(out.writes['nls_cchunk_lv1_0']).toEqual([{ a: 1 }, { a: 2 }]);
    expect(out.index.seqs).toEqual([0]);
    expect(out.removeKeys).toEqual(['nls_cchunk_lv1_1', 'nls_cchunk_lv1_2']);
  });
});

describe('readChunkedComments', () => {
  function makeGetMany(store) {
    return async (keys) => {
      /** @type {Record<string, unknown>} */
      const bag = {};
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(store, k)) bag[k] = store[k];
      }
      return bag;
    };
  }

  it('index があれば全チャンクを seq 順に連結する', async () => {
    const store = {
      nls_cchunk_index_lv1: buildChunkIndex('lv1', {
        seqs: [0, 1],
        total: 3,
        maxPerChunk: 2
      }),
      nls_cchunk_lv1_0: [{ no: 1 }, { no: 2 }],
      nls_cchunk_lv1_1: [{ no: 3 }],
      nls_comments_lv1: [{ stale: true }]
    };
    const res = await readChunkedComments('lv1', 'nls_comments_lv1', makeGetMany(store));
    expect(res.fromChunks).toBe(true);
    expect(res.rows).toEqual([{ no: 1 }, { no: 2 }, { no: 3 }]);
    expect(res.complete).toBe(true); // 全チャンク読めた=完全
  });

  // ★v0.1.1012: 一部チャンクが読めない(競合で非配列)=部分読み=complete:false(dedup seed を信用させない)。
  it('一部チャンクが欠落(非配列)なら complete:false(二重計上の根治)', async () => {
    const store = {
      nls_cchunk_index_lv1: buildChunkIndex('lv1', { seqs: [0, 1], total: 3, maxPerChunk: 2 }),
      nls_cchunk_lv1_0: [{ no: 1 }, { no: 2 }],
      // nls_cchunk_lv1_1 は欠落(read 失敗を模す)
      nls_comments_lv1: [{ stale: true }]
    };
    const res = await readChunkedComments('lv1', 'nls_comments_lv1', makeGetMany(store));
    expect(res.complete).toBe(false);
    expect(res.rows).toEqual([{ no: 1 }, { no: 2 }]); // 読めた分だけ(これで seed すると二重の温床)
  });

  // ★v0.1.1013: 全チャンクが配列でも合計件数 < index.total なら部分読み(古い空配列/未flush)=complete:false。
  it('合計件数がインデックスの total に満たないなら complete:false(二重再発の根治)', async () => {
    const store = {
      nls_cchunk_index_lv1: buildChunkIndex('lv1', { seqs: [0, 1], total: 3, maxPerChunk: 2 }),
      nls_cchunk_lv1_0: [{ no: 1 }, { no: 2 }],
      nls_cchunk_lv1_1: [] // 配列だが空(古い/未flush)→合計2 < total 3
    };
    const res = await readChunkedComments('lv1', 'nls_comments_lv1', makeGetMany(store));
    expect(res.complete).toBe(false);
    expect(res.rows.length).toBe(2);
  });

  it('合計件数 === total なら complete:true', async () => {
    const store = {
      nls_cchunk_index_lv1: buildChunkIndex('lv1', { seqs: [0, 1], total: 3, maxPerChunk: 2 }),
      nls_cchunk_lv1_0: [{ no: 1 }, { no: 2 }],
      nls_cchunk_lv1_1: [{ no: 3 }]
    };
    const res = await readChunkedComments('lv1', 'nls_comments_lv1', makeGetMany(store));
    expect(res.complete).toBe(true);
  });

  it('seqs 空のインデックスは complete:true(0件は完全)', async () => {
    const store = {
      nls_cchunk_index_lv1: buildChunkIndex('lv1', { seqs: [], total: 0, maxPerChunk: 2 })
    };
    const res = await readChunkedComments('lv1', 'nls_comments_lv1', makeGetMany(store));
    expect(res.complete).toBe(true);
    expect(res.rows).toEqual([]);
  });

  it('index が無ければ従来 main にフォールバック', async () => {
    const store = { nls_comments_lv1: [{ no: 1 }] };
    const res = await readChunkedComments('lv1', 'nls_comments_lv1', makeGetMany(store));
    expect(res.fromChunks).toBe(false);
    expect(res.rows).toEqual([{ no: 1 }]);
    expect(res.complete).toBe(true);
  });

  it('何も無ければ空配列(main 欠落=complete:true=従来運用)', async () => {
    const res = await readChunkedComments('lv1', 'nls_comments_lv1', makeGetMany({}));
    expect(res.rows).toEqual([]);
    expect(res.fromChunks).toBe(false);
    expect(res.complete).toBe(true);
  });

  it('migrate→append→read の往復で総件数と順序が保たれる', async () => {
    const main = Array.from({ length: 5 }, (_, i) => ({ no: i }));
    const store = { nls_comments_lv1: main };
    const mig = planMigrateMainToChunks('lv1', main, { maxPerChunk: 2 });
    Object.assign(store, mig.writes);
    store[chunkIndexKey('lv1')] = mig.index;

    const app = planAppendRowsAsChunks('lv1', mig.index, [{ no: 5 }, { no: 6 }], {
      maxPerChunk: 2
    });
    Object.assign(store, app.writes);
    store[chunkIndexKey('lv1')] = app.index;

    const res = await readChunkedComments('lv1', 'nls_comments_lv1', makeGetMany(store));
    expect(res.rows.map((r) => r.no)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(res.index.total).toBe(7);
  });
});
