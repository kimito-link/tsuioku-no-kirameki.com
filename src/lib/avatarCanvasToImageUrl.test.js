import { describe, it, expect, vi, afterEach } from 'vitest';
import { canvasToImageUrl } from './avatarPartsComposer.js';

/**
 * canvas → <img src> 用 URL の作り方。
 *
 * 2026-10-11: toDataURL(メインスレッドで同期に PNG 書き出し)から toBlob(別スレッド)へ。
 *   実測: 匿名330人の合成で toDataURL だけ 3〜4秒・起動の主スレッド総時間が 9.8〜11.3秒 → 6.5〜6.7秒。
 * 2026-10-12: ★blob: URL のままだと解放されずに積み上がる漏れだった(退化)。
 *   実測(perf-ab・放送中): 作成295・解放0・未解放295・合計6.7MB(10秒)→ 378・解放0・8.6MB(91秒)。
 *   1枚 約23KB。しかも「別人の数」でなく【合成のたび】に増える(キャッシュは256件=追い出された人は次の描画で
 *   また合成され、新しい blob が積まれる)。お使いのPCの記録では、起動直後のプロセスのメモリが1分で約1.8GB・
 *   5分ごとに約+2GB で 6.3GB に達していた。
 *   → 書き出しは toBlob(別スレッド)のまま、結果は FileReader で data: URL の【文字列】にする。
 *     文字列は使い終われば GC され、解放の管理が要らない(標準の作法)。blob URL を一切作らない。
 */
afterEach(() => {
  vi.restoreAllMocks();
});

/** FileReader の差し替え(vitest の環境差に依存せず、読み込み結果を指定できる)。 */
function stubFileReader(result, { fail = false } = {}) {
  class FakeReader {
    readAsDataURL(blob) {
      queueMicrotask(() => {
        if (fail) {
          this.error = new Error('read failed');
          this.onerror?.();
        } else {
          this.result = typeof result === 'function' ? result(blob) : result;
          this.onload?.();
        }
      });
    }
  }
  vi.stubGlobal('FileReader', FakeReader);
}

describe('canvasToImageUrl', () => {
  it('★toBlob で別スレッドに書き出し、FileReader で data: URL の文字列にする(blob URL を作らない)', async () => {
    const blob = { size: 10 };
    const canvas = {
      toBlob: vi.fn((cb) => cb(blob)),
      toDataURL: vi.fn(() => 'data:image/png;base64,SYNC')
    };
    stubFileReader('data:image/png;base64,FROMBLOB');
    const create = vi.spyOn(URL, 'createObjectURL');
    const url = await canvasToImageUrl(canvas);
    expect(url).toBe('data:image/png;base64,FROMBLOB');
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(canvas.toDataURL).not.toHaveBeenCalled(); // メインスレッドで同期に書き出さない
    expect(create).not.toHaveBeenCalled(); // ★解放が要る blob URL を作らない=積み上がらない
  });

  it('★何度呼んでも blob URL は1つも作られない(漏れの再発防止)', async () => {
    const canvas = {
      toBlob: vi.fn((cb) => cb({ size: 23_000 })),
      toDataURL: vi.fn(() => 'data:image/png;base64,SYNC')
    };
    stubFileReader('data:image/png;base64,X');
    const create = vi.spyOn(URL, 'createObjectURL');
    for (let i = 0; i < 200; i += 1) await canvasToImageUrl(canvas);
    expect(create).toHaveBeenCalledTimes(0);
  });

  it('★toBlob が null を返したら、従来の toDataURL に戻る(画像が消えない)', async () => {
    const canvas = {
      toBlob: vi.fn((cb) => cb(null)),
      toDataURL: vi.fn(() => 'data:image/png;base64,FALLBACK')
    };
    stubFileReader('data:image/png;base64,never');
    expect(await canvasToImageUrl(canvas)).toBe('data:image/png;base64,FALLBACK');
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('★toBlob が無い環境では toDataURL(従来どおり)', async () => {
    const canvas = { toDataURL: vi.fn(() => 'data:image/png;base64,OLD') };
    expect(await canvasToImageUrl(canvas)).toBe('data:image/png;base64,OLD');
  });

  it('★FileReader の読み込みが失敗しても toDataURL に戻る(顔が消えない)', async () => {
    const canvas = {
      toBlob: vi.fn((cb) => cb({})),
      toDataURL: vi.fn(() => 'data:image/png;base64,READFAIL')
    };
    stubFileReader(null, { fail: true });
    expect(await canvasToImageUrl(canvas)).toBe('data:image/png;base64,READFAIL');
  });

  it('★FileReader が無い環境でも toDataURL に戻る', async () => {
    const canvas = {
      toBlob: vi.fn((cb) => cb({})),
      toDataURL: vi.fn(() => 'data:image/png;base64,NOREADER')
    };
    vi.stubGlobal('FileReader', undefined);
    expect(await canvasToImageUrl(canvas)).toBe('data:image/png;base64,NOREADER');
  });

  it('★読み込み結果が data: で始まらない(壊れた値)なら toDataURL に戻る', async () => {
    const canvas = {
      toBlob: vi.fn((cb) => cb({})),
      toDataURL: vi.fn(() => 'data:image/png;base64,BADRESULT')
    };
    stubFileReader('');
    expect(await canvasToImageUrl(canvas)).toBe('data:image/png;base64,BADRESULT');
  });
});
