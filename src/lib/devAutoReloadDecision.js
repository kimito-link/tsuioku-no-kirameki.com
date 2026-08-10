/**
 * devAutoReloadDecision — 開発用オートリロードの判定(v0.1.1318)。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★なぜ要るか（2026-08-10 ユーザー要望「反映まで全部やって毎回やらせないで」）
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 反映3手順のうち、開発者(私)が自動化できるのは2つまで:
 *   1. `git pull`          … 自動化できる
 *   2. `npm run copy:ext`  … 自動化できる(C:\nicolive-ext へコピー)
 *   3. **拡張のリロード**   … Chrome の更新ボタン=ユーザーの手作業
 *   4. watch タブ F5       … 3 が済めば拡張側から実行できる(既存の update ハンドラ)
 *
 * ★3 が毎回ユーザーの手を止めていた。ここを拡張自身に解かせる。
 *   [[claude-cannot-drive-own-extension-pages]] の「自動化したければ拡張側に
 *   開発用機能を実装する方向で解く」に沿った実装。
 *
 * ■ 仕組み
 *   SW が定期的に自分のビルドIDを見に行き、**ディスク上のビルドIDが変わっていたら**
 *   `chrome.runtime.reload()` する。copy:ext した瞬間に拡張が自分で入れ替わる。
 *
 * ■ 安全のための制約（ここが本体）
 *   - **unpacked(開発用ロード)のときだけ**動く。ストア版では絶対に動かさない
 *     (`update_url` の有無で判定＝ストア配布のみ付与される)。
 *   - 起動直後の1回目は「変化」と見なさない(初回の基準値を取るだけ)。
 *     さもないと SW が起きるたびにリロードループになる。
 *   - ビルドIDが読めない/空なら何もしない(推測でリロードしない)。
 *
 * @module devAutoReloadDecision
 */

/**
 * この環境で開発用オートリロードを有効にしてよいか。
 *
 * ★ストア版で自動リロードが走ると、ユーザーの視聴中に予告なく拡張が落ちる。
 *   絶対に unpacked 限定にする。
 *
 * @param {{ updateUrl?: unknown, installType?: unknown }} env
 *   updateUrl: manifest の update_url(ストア配布のみ存在)
 *   installType: chrome.management 由来 'development' 等(取れないこともある)
 * @returns {boolean}
 */
export function isDevAutoReloadAllowed(env) {
  const e = env && typeof env === 'object' ? env : {};
  // ストア配布の印がある＝本番。何があっても無効。
  const updateUrl = String(e.updateUrl ?? '').trim();
  if (updateUrl) return false;
  // installType が取れるなら development のときだけ許す。
  const installType = String(e.installType ?? '').trim();
  if (installType) return installType === 'development';
  // update_url が無く installType も不明＝unpacked の可能性が高いが、
  // ★確証が無いので許可する側に倒さない(安全側)。
  return false;
}

/**
 * 前回見たビルドIDと今回のビルドIDから「リロードすべきか」を決める。
 *
 * @param {{ previousBuildId?: unknown, currentBuildId?: unknown, allowed?: unknown }} input
 * @returns {{ reload: boolean, nextBuildId: string, reason: string }}
 */
export function decideDevAutoReload(input) {
  const inp = input && typeof input === 'object' ? input : {};
  const allowed = Boolean(inp.allowed);
  const current = String(inp.currentBuildId ?? '').trim();
  const previous = String(inp.previousBuildId ?? '').trim();

  if (!allowed) return { reload: false, nextBuildId: previous, reason: 'disabled(非開発環境)' };
  // ★読めないときは何もしない(推測でリロードしない)。
  if (!current) return { reload: false, nextBuildId: previous, reason: 'buildId が読めない' };
  // 初回は基準値を覚えるだけ(ここでリロードするとSWが起きるたびに無限ループ)。
  if (!previous) return { reload: false, nextBuildId: current, reason: '初回(基準値を記録)' };
  if (previous === current) return { reload: false, nextBuildId: current, reason: '変化なし' };
  return { reload: true, nextBuildId: current, reason: `buildId 変化(${previous}→${current})` };
}
