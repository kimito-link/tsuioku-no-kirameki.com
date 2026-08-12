import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs
  .readFileSync(path.join(root, 'extension/sidepanel-entry.js'), 'utf8')
  .replace(/\r\n/g, '\n');

/**
 * ★v0.1.1298: 「出た直後だけ黒い」を計器自身が消してしまう穴を塞ぐ。
 *
 * ■ ユーザー報告(2026-08-09)
 *   「ずっと黒くなるわけじゃなくて、出てくるとき黒いのが出て、しばらくしたら直る」
 *   =flash(一瞬)。ところが状態速報は毎回「✅正常」しか出さなかった。
 *
 * ■ 真因
 *   sidepanel-entry.js は2回測っていたが、【同じ storage キーへ素で set】していた。
 *     1回目 load+50ms  → 🔴(黒い瞬間) を書く
 *     2回目 2500ms     → ✅(落ち着いた後) で【上書き】
 *   結果、実機で必ず ✅ しか残らない。計器自身が
 *   [[settled-state-hides-flash-bugs-2026-08-07]] を踏んでいた。
 *
 * ■ 直し方
 *   一度でも黒を観測したら保持し、以後の✅で塗り潰さない(_worst)。
 *   さらに測る回数を増やして、2点の【あいだ】で出る黒を取り逃がさない。
 */
describe('サイドパネル自己診断: 一瞬の黒を後の✅で消さない', () => {
  it('★黒を観測したら保持する変数がある(_worst)', () => {
    expect(src).toMatch(/let\s+_worst\s*=\s*null/);
  });

  it('★「黒かつ未記録」のときだけ最悪値を確定する(後の黒で上書きし直さない)', () => {
    /*
     * ★v0.1.1302: 条件に `!unlaidOut` が加わった。
     *   窓が 0x0(未レイアウト)の測定を最悪値にすると【毎回必ず偽の🔴】が残る
     *   (t=0 の setTimeout はレイアウト前に走りうる=実機 v0.1.1298 がこれ)。
     *   守る不変条件は変わらない:
     *     (a) 黒を見たときだけ記録する         → !verdict.ok
     *     (b) 一度記録したら上書きしない       → !_worst
     *     (c) 偽陽性(未レイアウト)は記録しない → !unlaidOut ←追加
     */
    expect(src).toMatch(/if\s*\(\s*!verdict\.ok\s*&&\s*!unlaidOut\s*&&\s*!_worst\s*\)\s*_worst\s*=/);
    // (c) の判定が「未レイアウト」由来であることまで固定する(別の条件に化けたら赤)。
    expect(src).toMatch(/const unlaidOut = String\(verdict\.cause \|\| ''\)\.startsWith\('未レイアウト'\);/);
  });

  it('★storage に書く ok は「今」ではなく「一度も黒くなかったか」である', () => {
    /*
     * ★v0.1.1373: 判定式を overallOk に切り出した(表示と保存で同じ値を使うため)。
     *   const overallOk = verdict.ok && !flashed && !_lateBlack && !blindTooLong
     *   - flashed を無視すると起動直後の一瞬の黒が✅で消える
     *   - ★v0.1.1351: _lateBlack を無視すると「あとから黒くなった」実機が✅になる
     *   - ★v0.1.1373: blindTooLong を無視すると【12.7秒中身が出ていないのに✅正常】に戻る
     *     (2026-08-12 実機で実際に起きた)
     * ★行末まで固定する: 末尾を開けたままだと条件を1つ消しても
     *   前半だけ一致して素通りする([[mutation-test-needs-anchored-regex]])。
     */
    expect(src).toMatch(
      /const overallOk = verdict\.ok && !flashed && !_lateBlack && !blindTooLong;/
    );
    // storage に書く ok が、その overallOk そのものであること(別の式に化けたら赤)。
    expect(src).toMatch(/ok:\s*overallOk,/);
  });

  it('★黒を見たら cause / sample も黒かった瞬間のものを出す', () => {
    /*
     * ★v0.1.1351: cause の優先順位は3段になった。
     *   flashed(起動直後の一瞬) > _lateBlack(あとから黒くなった) > 今の値
     *   flash が最優先である点は不変(ここが崩れると一瞬の黒が消える)。
     *   late を足したのは「30秒より後に黒くなった実機」を✅と report しないため。
     */
    /*
     * ★v0.1.1373: 優先順位に blindTooLong が加わり4段になった。
     *   flashed > _lateBlack > blindTooLong(中身が長時間出ない) > 今の値
     *   flash が最優先である点は不変(ここが崩れると一瞬の黒が消える)。
     */
    expect(src).toMatch(
      /cause:\s*flashed\s*[\s\S]{0,40}\?\s*worst\.verdict\.cause\s*:\s*_lateBlack/
    );
    expect(src).toMatch(/_lateBlack\.verdict\.cause\s*:\s*blindTooLong/);
    expect(src).toMatch(/sample:\s*flashed\s*\?\s*worst\.sample\s*:\s*sample/);
  });

  it('★測定は多点である(2点だけだと「あいだ」の黒を取り逃がす)', () => {
    const m = src.match(/const\s+SAMPLE_AT_MS\s*=\s*\[([^\]]*)\]/);
    expect(m).toBeTruthy();
    const points = m[1].split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    expect(points.length).toBeGreaterThanOrEqual(8);
    // 序盤(最初の500ms)に密に測っていること=黒は最初の数百msに出る。
    expect(points.filter((n) => n <= 500).length).toBeGreaterThanOrEqual(4);
  });

  it('★測定ループが無条件に実行される文である', () => {
    /*
     * ★文字列の存在だけでは `if (false)` 前置を検知できない
     *   ([[wiring-test-mutation-check-2026-08-01]])。
     *   for 文の直前の改行と本体の setTimeout までアンカーする。
     */
    expect(src).toMatch(
      /\nfor \(const ms of SAMPLE_AT_MS\) \{\n {2}setTimeout\(/
    );
  });
});
