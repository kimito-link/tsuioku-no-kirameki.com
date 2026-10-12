import { describe, it, expect, vi, afterEach } from 'vitest';
import { canvasToImageUrl } from './avatarPartsComposer.js';

/**
 * canvas → <img src> 用 URL の作り方(2026-10-11)。toDataURL(メインスレッドで同期に PNG 書き出し)から toBlob(別スレッド)へ。
 * 実測: 匿名330人の合成で toDataURL だけ 3〜4秒・起動の主スレッド総時間が 9.8〜11.3秒 → 6.5〜6.7秒。
 */
afterEach(() => {
  vi.restoreAllMocks();
});

describe('canvasToImageUrl', () => {
  it('★toBlob が使えるなら toBlob+createObjectURL を使い、toDataURL は呼ばない(メインスレッドで書き出さない)', async () => {
    const blob = { size: 10 };
    const canvas = {
      toBlob: vi.fn((cb) => cb(blob)),
      toDataURL: vi.fn(() => 'data:image/png;base64,SYNC')
    };
    const spy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
    const url = await canvasToImageUrl(canvas);
    expect(url).toBe('blob:test-url');
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(spy).toHaveBeenCalledWith(blob);
    expect(canvas.toDataURL).not.toHaveBeenCalled();
  });

  it('★toBlob が null を返したら、従来の toDataURL に戻る(画像が消えない)', async () => {
    const canvas = {
      toBlob: vi.fn((cb) => cb(null)),
      toDataURL: vi.fn(() => 'data:image/png;base64,FALLBACK')
    };
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:never');
    expect(await canvasToImageUrl(canvas)).toBe('data:image/png;base64,FALLBACK');
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('★toBlob が無い環境では toDataURL(従来どおり)', async () => {
    const canvas = { toDataURL: vi.fn(() => 'data:image/png;base64,OLD') };
    expect(await canvasToImageUrl(canvas)).toBe('data:image/png;base64,OLD');
  });

  it('★createObjectURL が無い環境でも toDataURL に戻る', async () => {
    const canvas = {
      toBlob: vi.fn((cb) => cb({})),
      toDataURL: vi.fn(() => 'data:image/png;base64,NOURL')
    };
    vi.spyOn(URL, 'createObjectURL', 'get').mockReturnValue(undefined);
    expect(await canvasToImageUrl(canvas)).toBe('data:image/png;base64,NOURL');
  });
});
