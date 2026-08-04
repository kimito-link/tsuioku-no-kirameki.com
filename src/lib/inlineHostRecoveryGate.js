/**
 * パネルが「消えたまま戻らない」を防ぐ復帰ゲート(純関数)。
 *
 * ★v0.1.1254 の真因(2026-08-04・実測 hostVisWatch が確定させた):
 *   maxHiddenFrames:426(約7秒) / currentlyHidden:true /
 *   display:"none" opacity:"0" visibility:"visible" connected:true
 *   = hidePageFrameOverlay() が消したまま、誰も戻していない状態。
 *
 * ■ なぜ戻らなかったか(構造)
 *   パネルを戻す処理は renderPageFrameOverlay() の中にしか無い(opacity='1' に戻す
 *   6箇所すべてがその内側)。そして呼び出し口 3本が全部 inlineLayoutDirty 待ちだった:
 *     - 360ms ループ            : if (!inlineLayoutDirty) return;   (v0.1.407〜)
 *     - 4秒 watch 分岐          : v0.1.1250 で【私が】ゲートを追加
 *     - 4秒 非watch 分岐        : v0.1.1250 で【私が】ゲートを追加
 *   v0.1.1250 以前は下2本が無条件だったので、消えても4秒以内に必ず復帰していた。
 *   ★つまり 4秒ちらつきを止めた変更が、同時に最後の非常口を塞いだ。
 *
 *   さらに inlineLayoutDirty を立てる ResizeObserver は【プレイヤー要素】を見ており、
 *   パネル自身は見ていない。動画は再生され続けサイズも変わらないので、
 *   パネルが消えてもフラグは永久に立たない=閉じた罠になっていた。
 *
 * ■ この関数の役目
 *   「ゲートは残しつつ、実際に消えているときだけ描画を通す」判定を1箇所に閉じる。
 *   ゲートを丸ごと戻す(=無条件描画)と 4秒周期のちらつきが再発するため、
 *   ★「消えている」を第3の通過条件として足すのが正しい直し方。
 *
 * ■ 性能の掟
 *   この判定は 4秒に1回だけ呼ぶ(360ms ループには足さない)。
 *   v0.1.1201 で paint 毎の DOM 走査を入れて拡張全体を重くした反省
 *   ([[instrument-must-name-the-cause-2026-08-01]] の周辺で記録)。
 */

/**
 * 4秒周期の再描画を通すべきか。
 *
 * @param {object} args
 * @param {boolean} [args.liveIdSwitched] 配信が切り替わった(watch 分岐のみ渡す)。
 * @param {boolean} [args.layoutDirty] geometry が変わった(Observer が立てたフラグ)。
 * @param {boolean} [args.hostVisible] パネルがいま実際に見えているか。
 * @param {boolean} [args.hostKnown] 可視判定が取れたか。false=判定不能(host 未作成など)。
 * @returns {{ render: boolean, reason: 'live-switch'|'layout-dirty'|'host-hidden'|'skip' }}
 */
export function shouldRenderInlineHostOnPoll(args) {
  // 配信切替は従来どおり最優先で描く(中身が別配信になるため)。
  if (args?.liveIdSwitched === true) return { render: true, reason: 'live-switch' };
  // geometry 変化も従来どおり(v0.1.1250 のゲートはここまでが正しかった)。
  if (args?.layoutDirty === true) return { render: true, reason: 'layout-dirty' };
  // ★追加した第3の条件: 実際に消えているなら描く(=復帰の非常口)。
  //   判定不能(hostKnown=false)のときは描かない。host がまだ無い段階で毎4秒
  //   重い再描画を走らせると、起動直後に無駄な負荷がかかるため。
  //   ※host が無い状態からの初期描画は inlineLayoutDirty の初期値 true が担う。
  if (args?.hostKnown === true && args?.hostVisible === false) {
    return { render: true, reason: 'host-hidden' };
  }
  return { render: false, reason: 'skip' };
}

/**
 * 「watch ページに居るのにパネルを消してよいか」の判定。
 *
 * ★消しすぎの真因: 消す条件が hasWatchCommentPanel() の false 連続だけだった。
 *   これはニコ生側の SPA 再描画でコメント欄 DOM が一時的に差し替わると成立する。
 *   「コメント欄が見つからない」と「視聴ページを離れた」は別の事象なので区別する。
 *   URL が watch のままならページを離れていない=消さない(fail-safe 側)。
 *
 * @param {object} args
 * @param {boolean} [args.stillOnWatchUrl] URL がまだ配信視聴ページか。
 * @param {number} [args.missTicks] コメント欄が見つからなかった連続回数。
 * @param {number} [args.threshold] 消すまでの連続回数。
 * @returns {{ hide: boolean, reason: 'left-page'|'panel-missing'|'keep-on-watch'|'below-threshold' }}
 */
export function shouldHideInlineHostOnMissingPanel(args) {
  const miss = Math.max(0, Math.floor(Number(args?.missTicks) || 0));
  const threshold = Math.max(1, Math.floor(Number(args?.threshold) || 5));
  if (miss < threshold) return { hide: false, reason: 'below-threshold' };
  // ★視聴ページに居るならパネルは消さない。コメント欄の一時的な消失に巻き込まれない。
  if (args?.stillOnWatchUrl === true) return { hide: false, reason: 'keep-on-watch' };
  return { hide: true, reason: 'left-page' };
}

/**
 * 復帰ゲートの計器を1行に整形する。★0 の意味を区別する。
 * @param {{ recoverCount?: number, checkCount?: number, keptOnWatchCount?: number }|null|undefined} diag
 * @returns {string}
 */
export function formatInlineHostRecoveryLine(diag) {
  const d = diag && typeof diag === 'object' ? diag : null;
  if (!d) return '';
  const checks = Math.max(0, Math.floor(Number(d.checkCount) || 0));
  if (checks <= 0) {
    return 'パネル復帰 ⚪ 未計測(判定0回=まだ4秒周期の点検が回っていません)';
  }
  const rec = Math.max(0, Math.floor(Number(d.recoverCount) || 0));
  const kept = Math.max(0, Math.floor(Number(d.keptOnWatchCount) || 0));
  const parts = [];
  if (rec > 0) {
    parts.push(`パネル復帰 🛡 ${rec}回復帰させました(点検${checks}回)`);
    parts.push('  → 消えたままにならないよう4秒周期で描き直しています(これが出るのは正常な防御)');
  } else {
    parts.push(`パネル復帰 ✅ 復帰不要(点検${checks}回=消えたままの状態は起きていません)`);
  }
  if (kept > 0) {
    parts.push(`  → コメント欄の一時消失でパネルを消すのを ${kept}回 見送りました`);
  }
  return parts.join('\n');
}
