import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/*
 * ★配線テスト(2026-08-11・v0.1.1329)
 *
 * ■ なぜ要るか(実際に踏んだ)
 *   読み上げは【会場(VoicePlayer クラス)】と【コメビュ(comeview-entry の独自実装)】の
 *   2つに分岐している。v0.1.1326/1327 で「読み上げがONにならない/一瞬で戻る」を直したが、
 *   触ったのは VoicePlayer だけで、コメビュは素通しのままだった。
 *   ユーザーはコメビュのボタンを押していたため【何も変わらなかった】。
 *   → 「片方だけ直して直ったと報告する」を構造的に防ぐため、
 *      両実装が同じ修正を持っていることをソース上で固定する。
 *
 * ■ 何を固定するか(挙動の同一性・3点)
 *   ① 失敗しても OFF を永続保存しない(persist:false)
 *   ② 再試行はバックオフ定数を共有(1回で諦めない)
 *   ③ 自動再生ブロックで読み上げごと OFF にしない
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const COMEVIEW = join(HERE, '..', 'extension', 'comeview-entry.js');
const VOICE_PLAYER = join(HERE, 'voicePlayer.js');

describe('読み上げ2実装の修正パリティ(会場 ⇄ コメビュ)', () => {
  const cv = readFileSync(COMEVIEW, 'utf8');
  const vp = readFileSync(VOICE_PLAYER, 'utf8');

  /*
   * ★ファイル全体を検索してはいけない: disableVoiceReading({persist:false}) は
   *   別経路(ページ離脱時など)にも元から存在するため、全体検索だと
   *   【生存確認の失敗分岐を persist:true に戻しても緑のまま】になる。
   *   実際に変異テストで素通りして発覚した。判定は該当分岐に限定する。
   */
  const probeFailBranch = (() => {
    const i = cv.indexOf('if (!probe.ok) {\n    // ★persist:false');
    if (i < 0) return '';
    return cv.slice(i, i + 400);
  })();

  it('★コメビュ: 生存確認の失敗分岐で OFF を永続保存しない', () => {
    expect(probeFailBranch).not.toBe(''); // 分岐が見つからない=構造が変わった
    expect(probeFailBranch).toMatch(/disableVoiceReading\(\s*\{\s*persist:\s*false\s*\}\s*\)/);
    expect(probeFailBranch).not.toMatch(/disableVoiceReading\(\s*\{\s*persist:\s*true\s*\}\s*\)/);
  });

  it('★両実装が同じ再試行バックオフ定数を使う(片方だけ1回のまま にしない)', () => {
    expect(vp).toMatch(/export const VOICE_ALIVE_RETRY_BACKOFF_MS/);
    expect(cv).toMatch(/VOICE_ALIVE_RETRY_BACKOFF_MS/);
  });

  it('★両実装が理由付きの生存確認(probeVoicevoxAlive)を使う', () => {
    expect(cv).toMatch(/probeVoicevoxAlive/);
    expect(vp).toMatch(/probeVoicevoxAlive/);
  });

  it('★両実装が解錠(無音WAV)を行う', () => {
    expect(vp).toMatch(/SILENT_WAV_DATA_URI/);
    expect(cv).toMatch(/SILENT_WAV_DATA_URI/);
  });

  it('★コメビュ: 自動再生ブロックで読み上げを OFF にしない', () => {
    /*
     * 旧実装:
     *   if (err && err.name === 'NotAllowedError') {
     *     setVoiceStatus(...);
     *     _voiceReadingEnabled = false;   ← これが「一瞬ONになって戻る」の正体
     *     updateVoiceToggle();
     *   }
     * ★NotAllowedError の分岐【ブロックの中だけ】を見る。窓を広く取ると
     *   無関係の disableVoiceReading(正当な OFF)まで拾って誤検知する
     *   (最初この窓を700文字にして実際に誤検知した)。
     */
    const i = cv.indexOf("err.name === 'NotAllowedError'");
    expect(i).toBeGreaterThan(-1);
    const branch = cv.slice(i, i + 700);
    /*
     * ★コメント行は除外してから判定する。
     *   最初これを忘れ、修正の【説明文】に含まれる "_voiceReadingEnabled=false" を
     *   実コードと誤認して赤くなった(コードは正しいのにテストだけ落ちる偽陽性)。
     */
    const code = branch
      .split('\n')
      .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))
      .join('\n');
    expect(code).not.toMatch(/_voiceReadingEnabled\s*=\s*false/);
    // 代わりに計器と案内があること。
    expect(code).toMatch(/audioBlockedTotal/);
  });

  it('★コメビュ: ブロック件数を計器に残す(無音の切り分けができる)', () => {
    expect(cv).toMatch(/audioBlockedTotal/);
    expect(vp).toMatch(/audioBlockedTotal/);
  });

  it('★コメビュ: source を書く(どちらの実装の記録か分かる)', () => {
    expect(cv).toMatch(/source:\s*'comeview'/);
  });
});
