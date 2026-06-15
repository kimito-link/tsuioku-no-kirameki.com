import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  VOICEVOX_BASE_URL,
  buildMergedVoiceText,
  buildVoiceReadingText,
  defaultVoicevoxAliveTimeoutMs,
  isVoicevoxAlive,
  isWhisperStyleName,
  listVoicevoxStyleIds,
  synthesizeVoice
} from './voicevoxClient.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('isVoicevoxAlive', () => {
  it('GET /version が成功すれば true', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    await expect(isVoicevoxAlive({ fetchFn })).resolves.toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      `${VOICEVOX_BASE_URL}/version`,
      expect.objectContaining({ method: 'GET', signal: expect.any(AbortSignal) })
    );
  });

  it('通信失敗は false', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(isVoicevoxAlive({ fetchFn })).resolves.toBe(false);
  });

  it('タイムアウト時は false', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(() => new Promise(() => {}));
    const pending = isVoicevoxAlive({ fetchFn, timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    await expect(pending).resolves.toBe(false);
  });
});

describe('defaultVoicevoxAliveTimeoutMs', () => {
  it('プロキシ経由(content script)は長め 5000ms', () => {
    // 会場モード(SW プロキシ経由)は MV3 SW コールド起床で遅いので長め。
    expect(defaultVoicevoxAliveTimeoutMs(true)).toBe(5000);
  });
  it('直接 fetch(拡張ページ)は従来どおり 1500ms', () => {
    expect(defaultVoicevoxAliveTimeoutMs(false)).toBe(1500);
  });
});

describe('listVoicevoxStyleIds', () => {
  it('speaker.styles の id を順序維持で重複なく返す', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { styles: [{ id: 3 }, { id: 1 }] },
        { styles: [{ id: 1 }, { id: 8 }] }
      ]
    });
    await expect(listVoicevoxStyleIds({ fetchFn })).resolves.toEqual([3, 1, 8]);
  });

  it('不正レスポンスや失敗は空配列', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false });
    await expect(listVoicevoxStyleIds({ fetchFn })).resolves.toEqual([]);
  });

  it('ささやき/ウィスパー系スタイルは除外する(ユーザー方針)', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { styles: [{ id: 0, name: 'ノーマル' }, { id: 3, name: 'ささやき' }] },
        { styles: [{ id: 5, name: 'ウィスパー' }, { id: 8, name: 'あまあま' }] }
      ]
    });
    // ささやき(3)とウィスパー(5)は除外され、ノーマル(0)とあまあま(8)だけ残る
    await expect(listVoicevoxStyleIds({ fetchFn })).resolves.toEqual([0, 8]);
  });
});

describe('isWhisperStyleName', () => {
  it('ささやき/囁き/ウィスパー/whisper を含む名前は true', () => {
    expect(isWhisperStyleName('ささやき')).toBe(true);
    expect(isWhisperStyleName('囁き')).toBe(true);
    expect(isWhisperStyleName('ウィスパー')).toBe(true);
    expect(isWhisperStyleName('Whisper')).toBe(true);
  });
  it('通常スタイル名は false', () => {
    expect(isWhisperStyleName('ノーマル')).toBe(false);
    expect(isWhisperStyleName('あまあま')).toBe(false);
    expect(isWhisperStyleName('')).toBe(false);
    expect(isWhisperStyleName(null)).toBe(false);
  });
});

describe('synthesizeVoice', () => {
  it('audio_query と synthesis を順に呼び offset を加算する', async () => {
    const wav = new Uint8Array([1, 2, 3]).buffer;
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pitchScale: 0.1, speedScale: 1, intonationScale: 1 })
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => wav
      });

    await expect(
      synthesizeVoice(
        'こんにちは',
        { styleId: 8, pitchOffset: -0.03, speedOffset: 0.1 },
        { fetchFn }
      )
    ).resolves.toBe(wav);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][0]).toBe(
      `${VOICEVOX_BASE_URL}/audio_query?text=%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF&speaker=8`
    );
    const synthesisInit = fetchFn.mock.calls[1][1];
    expect(fetchFn.mock.calls[1][0]).toBe(
      `${VOICEVOX_BASE_URL}/synthesis?speaker=8`
    );
    expect(JSON.parse(synthesisInit.body)).toMatchObject({
      pitchScale: 0.07,
      speedScale: 1.1,
      intonationScale: 1
    });
  });

  it('audio_query 失敗時は synthesis を呼ばず null', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false });
    await expect(
      synthesizeVoice('本文', { styleId: 3 }, { fetchFn })
    ).resolves.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('synthesis 失敗時は null', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pitchScale: 0, speedScale: 1 })
      })
      .mockRejectedValueOnce(new Error('failed'));
    await expect(
      synthesizeVoice('本文', { styleId: 3 }, { fetchFn })
    ).resolves.toBeNull();
  });

  it('audio_query のタイムアウト時は null', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(() => new Promise(() => {}));
    const pending = synthesizeVoice(
      '本文',
      { styleId: 3 },
      { fetchFn, audioQueryTimeoutMs: 10 }
    );
    await vi.advanceTimersByTimeAsync(10);
    await expect(pending).resolves.toBeNull();
  });

  it('synthesis のタイムアウト時も null', async () => {
    vi.useFakeTimers();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pitchScale: 0, speedScale: 1 })
      })
      .mockImplementationOnce(() => new Promise(() => {}));
    const pending = synthesizeVoice(
      '本文',
      { styleId: 3 },
      { fetchFn, synthesisTimeoutMs: 10 }
    );
    await vi.advanceTimersByTimeAsync(10);
    await expect(pending).resolves.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('空本文は fetch せず null', async () => {
    const fetchFn = vi.fn();
    await expect(
      synthesizeVoice('   ', { styleId: 3 }, { fetchFn })
    ).resolves.toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('buildVoiceReadingText', () => {
  it('名前と本文を読点でつなぐ', () => {
    expect(buildVoiceReadingText({ name: 'りすなー', text: 'こんにちは' })).toBe(
      'りすなー、こんにちは'
    );
  });

  it('URLをURL省略へ置換する', () => {
    expect(
      buildVoiceReadingText({
        name: '',
        text: '詳細 https://example.com/path?q=1 を見て'
      })
    ).toBe('詳細 URL省略 を見て');
  });

  it('本文を最大60文字へ切り詰める', () => {
    const result = buildVoiceReadingText({ name: '', text: 'あ'.repeat(80) });
    expect(Array.from(result)).toHaveLength(60);
  });

  it('最大文字数を省略すると従来どおり本文を60文字にする', () => {
    expect(
      buildVoiceReadingText({
        name: 'りすなー',
        text: 'あ'.repeat(61)
      })
    ).toBe(`りすなー、${'あ'.repeat(60)}`);
  });

  it('最大文字数40では本文を40文字にする', () => {
    const result = buildVoiceReadingText(
      { name: '', text: 'あ'.repeat(60) },
      { maxChars: 40 }
    );
    expect(result).toBe('あ'.repeat(40));
  });

  it('不正な最大文字数は60へ戻す', () => {
    expect(
      buildVoiceReadingText(
        { name: '', text: 'あ'.repeat(70) },
        { maxChars: 'invalid' }
      )
    ).toBe('あ'.repeat(60));
    expect(
      buildVoiceReadingText(
        { name: '', text: 'あ'.repeat(70) },
        { maxChars: -1 }
      )
    ).toBe('あ'.repeat(60));
  });

  it('名前は本文の最大文字数に含めない', () => {
    expect(
      buildVoiceReadingText(
        { name: '長い名前'.repeat(20), text: 'あ'.repeat(50) },
        { maxChars: 40 }
      )
    ).toBe(`${'長い名前'.repeat(20)}、${'あ'.repeat(40)}`);
  });

  it('空本文は名前があっても空文字', () => {
    expect(buildVoiceReadingText({ name: 'りすなー', text: '  ' })).toBe('');
  });
});

describe('buildMergedVoiceText', () => {
  it('複数件なら残り件数を末尾へ付ける', () => {
    expect(
      buildMergedVoiceText({
        name: '',
        body: '8888',
        count: 4
      })
    ).toBe('8888、ほか3件');
  });

  it('1件なら残り件数を付けない', () => {
    expect(
      buildMergedVoiceText({
        name: 'りすなー',
        body: 'こんにちは',
        count: 1
      })
    ).toBe('りすなー、こんにちは');
  });

  it('本文を40文字に切り詰めた後で残り件数を付ける', () => {
    expect(
      buildMergedVoiceText(
        {
          name: 'りすなー',
          body: 'あ'.repeat(50),
          count: 3
        },
        { maxChars: 40 }
      )
    ).toBe(`りすなー、${'あ'.repeat(40)}、ほか2件`);
  });
});
