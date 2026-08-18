// @ts-nocheck — DOM 専用; 候補行は popup 由来のゆるい形をそのまま渡す
/**
 * 応援レーンの【中身LOD】— 枠は残す。中身だけ空にする。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ 何を解くか(2026-08-18・世界の標準手順で実測して確定)
 *   Chrome DevTools Protocol `Performance.getMetrics` の時間軸測定(コメント1,200件):
 *       拡張内DOM  7,108 → 13,682 (t=27s で頭打ち・以後横ばい)
 *       タイル         8 →  1,108
 *       JS Heap    4.3MB → 126.8MB → 112.7MB(【減る】= GC が効いている)
 *   ＝メモリリークではない。「最初に一気に作って居座る」型。
 *   Web業界の推奨は DOM総数1,500以下 ＝ 実測は【9倍】。
 *
 * ■ なぜ既存LODでは足りないか
 *   popup.html の `#sceneStoryUserLaneTanu > .nl-story-userlane-cell:nth-child(n + 25)[data-thumb='0']`
 *   は meta を display:none にし avatar を 22px に縮めるが、【DOM要素は1つも減らない】。
 *   見た目の密度は解決済み。残るのは要素数そのもの。
 *
 * ■ 採用した形(会議の批判役の指摘が決め手)
 *   「DOMから完全に削除せず、常に可視要素を保持する」
 *   ＝世界の標準的な仮想化(DOMごと消す)は【この製品には合わない】。
 *   一度出た人を消さない(never-drop・v0.1.1232)がユーザーの価値だから。
 *
 *   そこで: 1タイル=5要素(cell/img/metaEl/idRow/nameRow)のうち
 *   【cell(枠)だけ作り、子4要素を最初から作らない】。
 *   見積り: 5,540要素 → 1,228要素(78%減)＝基準1,500以下を、枠1,108個を残したまま達成。
 *
 * ■ ★一方通行(hollow → full のみ。full → hollow に戻さない)
 *   戻す運用は「img を捨てて作り直す」＝7版かけて消した churn の再生産
 *   ([[story-userlane-churn-filllanetier-v1039]])。
 *   最悪でも「全員を見に行ったら現状と同じ DOM 数」＝【現状より悪くならない】。
 *
 * ■ ★守っている不変条件
 *   C1 never-drop  : 枠は全員分作る。タイル枚数は1枚も減らない。
 *   C2 幕(シェード) : 枠を同じ fragment に入れる ＝ childElementCount は不変
 *                    ＝ `countStoryUserLaneDomTiles(els) > 0` が偽になる瞬間が【原理的に無い】。
 *                    (popup-entry.js の幕解除条件。0枚を作ると黒画面を再生産する)
 *   C3 diff-skip   : storyLaneTierBodyKey は items だけで鍵を作る。ここは「描くか」の
 *                    判定だけで【鍵には一切触れない】＝ちらつき対策と別レイヤー。
 *   C4 3画面       : ①POP と ④純Web のみ。③会場は wrapTileEl 経由で【明示的に除外】
 *                    (会場は CSS 3D変形で可視判定が崩れ、loading="lazy" でサムネが
 *                     出なくなり撤回した前科がある = IO も同じ穴に落ちる)。
 *   C5 スクロール  : `.nl-main` 1本。IO の root もそこに合わせる。
 *   C6            : content-visibility:auto は2回撤去済み ＝ 使わない。
 *   C7            : popup-entry.js は max-lines 余裕0行 ＝ 0行変更。
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * ★kill スイッチ(12版失敗の教訓・撤回手順その1)。
 *   false にすると分岐が全て旧経路へ倒れ、挙動が完全に元へ戻る。
 *   laneContentLod.wiring.test.js が「false のとき hollow を1個も作らない」を固定する。
 */
/*
 * ★★v0.1.1441: false へ倒した(ユーザー報告の退化を止める)。
 *
 * ■ 何が起きていたか(2026-08-19 ユーザー:「取れるべきサムネがおちてた」)
 *   hollow(枠だけ)のタイルは【可視域に入ったときだけ】中身に差し替わる。
 *   ところがサムネは【あとから届く】(avatarObserved で後から更新される)。
 *   描画時点でサムネが未到着だと hasRealThumb=false で hollow になり、
 *   そのタイルは dataset.thumb='0' のまま画面外に居続ける。
 *   ★つまり【後から届いたサムネが永久に出ない】= 取れるはずのサムネが落ちる。
 *
 * ■ なぜ直しではなく【止める】のか
 *   ユーザーの優先順位は明確: 「取れるべきサムネが落ちる退化は禁止」。
 *   サムネはこの拡張の価値そのもの(誰が応援したかが見えること)。
 *   対して LOD の利得は【DOM数の削減】という内部都合。
 *   ★価値を壊してまで軽さを取らない。
 *   直すなら「サムネが届いたら hollow を強制的に差し替える」経路が要るが、
 *   それは新しい配線を一本増やす = 別の版で安全にやる。
 *
 * ■ 戻し方
 *   true に戻すだけで v0.1.1426 の挙動に戻る(分岐は残してある)。
 *   ただし戻す前に【後から届いたサムネを差し替える経路】を先に入れること。
 */
export const LANE_CONTENT_LOD_ENABLED = false;

/**
 * 先頭から何枚を必ずフル(中身つき)で描くか。
 * ★24の根拠: popup.html / live-view.html の既存LOD規則が `nth-child(n + 25)` ＝
 *   25枚目以降を「meta非表示・avatar 22px」に落としている。同じ境界を使うことで
 *   「フルなのに meta が消えている」領域を作らない(見た目の段差を増やさない)。
 */
export const LANE_CONTENT_LOD_EAGER_HEAD = 24;

/** hollow な枠に付ける class(CSS が寸法を与える。dist 確認は ASCII のこの文字列を grep)。 */
export const LANE_CONTENT_LOD_HOLLOW_CLASS = 'nl-story-userlane-cell--hollow';

/**
 * IO の rootMargin。可視範囲の少し手前で中身を詰め始める。
 * ★先回りしすぎると全員 full になって効果が消えるため、1画面ぶん程度に留める。
 */
const LANE_CONTENT_LOD_ROOT_MARGIN = '600px 0px';

/**
 * 段ごとの LOD 状態。
 *   observer      : その段用の IntersectionObserver(段が消えたら破棄)
 *   filledKeys    : 既に中身を詰めた userId 集合(★一方通行の記憶。二重 fill を防ぐ)
 *   pending       : hollow な枠 → 中身を作る関数
 * @type {WeakMap<HTMLElement, { observer: IntersectionObserver | null, filledKeys: Set<string>, pending: WeakMap<HTMLElement, () => void> }>}
 */
const _laneLodState = new WeakMap();

/**
 * この段・この位置のタイルを hollow(枠だけ)にしてよいか。
 *
 * ★MVP のスコープ: たぬ姉段・25枚目以降・匿名(実サムネ無し)のみ。
 *   - 会場(wrapTileEl あり)は除外 ＝ C4
 *   - 実サムネ持ちは除外 ＝ 既存LODも縮めていない領域を勝手に変えない
 *   - 既に中身を詰めた人は除外 ＝ 一方通行(戻さない)
 *
 * @param {{ laneName: string, index: number, hasRealThumb: boolean, hasWrap: boolean, alreadyFilled: boolean }} ctx
 * @returns {boolean}
 */
export function shouldRenderHollow(ctx, enabled = LANE_CONTENT_LOD_ENABLED) {
  // ★第2引数は【検査用】。出荷経路は常に既定(=定数)を使う。
  //   こうしておくと、定数を false に倒しても
  //   【判定ロジック自体の検査は残せる】(将来 true に戻すときの安全網)。
  if (!enabled) return false;
  if (!ctx || typeof ctx !== 'object') return false;
  if (ctx.hasWrap === true) return false; // ③会場は対象外(3D変形で可視判定が崩れる前科)
  if (ctx.laneName !== 'tanu') return false; // MVP はたぬ姉段だけ
  if (ctx.hasRealThumb === true) return false; // 実サムネ持ちは既存LODも縮めていない
  if (ctx.alreadyFilled === true) return false; // 一度詰めたら戻さない(churn 再生産の防止)
  return Math.floor(Number(ctx.index) || 0) >= LANE_CONTENT_LOD_EAGER_HEAD;
}

/**
 * 中身のない「枠だけ」のタイルを作る。
 *
 * ★buildPersonTileEl と【同じ tagName・同じ基本 class】にする。
 *   理由: 既存の CSS セレクタ(`.nl-story-userlane-cell[data-thumb='0']` 等)と
 *   `countStoryUserLaneDomTiles`(childElementCount)の両方が、この形を前提にしている。
 *   ★リンク(<a>)にはしない: href の無い <a> はキーボード操作の順路に入らず、
 *     中身が入った瞬間に tagName が変わると diff が読めなくなる。
 *     hollow は常に <span> ＝ 中身を詰めるときに <a> へ差し替える(同一位置で置換)。
 *
 * @param {{ title?: string }} p 候補行
 * @returns {HTMLElement}
 */
export function buildHollowTileEl(p) {
  const cell = document.createElement('span');
  cell.className = `nl-story-userlane-cell ${LANE_CONTENT_LOD_HOLLOW_CLASS}`;
  // title は枠のうちから持たせる ＝ 中身が来る前でもホバーで誰か分かる
  //   (「情報を足すのでなく求めに応じて出す」= 既存LODと同じ考え方)。
  const tip = String((p && p.title) || '');
  if (tip) cell.title = tip;
  return cell;
}

/** 段の LOD 状態を取り出す(無ければ作る)。 */
function stateFor(laneEl) {
  let st = _laneLodState.get(laneEl);
  if (!st) {
    st = { observer: null, filledKeys: new Set(), pending: new WeakMap() };
    _laneLodState.set(laneEl, st);
  }
  return st;
}

/**
 * その段で既に中身を詰めた人か(＝一方通行の記憶)。
 * @param {HTMLElement} laneEl
 * @param {string} userKey
 */
export function isAlreadyFilled(laneEl, userKey) {
  if (!laneEl || !userKey) return false;
  const st = _laneLodState.get(laneEl);
  return st ? st.filledKeys.has(userKey) : false;
}

/**
 * 段を再描画/破棄する前に、その段の観測を全て解く。
 * ★IO はターゲット要素の参照を握る ＝ 解かないとリークする(地雷#3)。
 * @param {HTMLElement} laneEl
 */
export function forgetLaneContentLod(laneEl) {
  if (!laneEl) return;
  const st = _laneLodState.get(laneEl);
  if (!st) return;
  if (st.observer) {
    try { st.observer.disconnect(); } catch { /* 破棄失敗は描画を止めない */ }
    st.observer = null;
  }
  // ★filledKeys は【消さない】: 同一段で再描画されても「一度詰めた人」は
  //   詰めたままにする(戻さない=churn を作らない)。段が本当に作り直されたときは
  //   laneEl 自体が新しくなるので WeakMap ごと入れ替わる。
  st.pending = new WeakMap();
}

/**
 * hollow な枠を観測対象に登録する。可視域に入ったら fill を1回だけ呼ぶ。
 *
 * @param {HTMLElement} laneEl 段の要素
 * @param {HTMLElement} hollowEl 枠だけのタイル
 * @param {string} userKey 一方通行の記憶に使う鍵(空なら記憶しない)
 * @param {() => void} fill 中身を作って枠を置換する関数
 */
export function observeHollowTile(laneEl, hollowEl, userKey, fill, enabled = LANE_CONTENT_LOD_ENABLED) {
  // ★第5引数は【検査用】。出荷経路は常に既定(=定数)を使う。
  if (!enabled) return;
  if (!laneEl || !hollowEl || typeof fill !== 'function') return;
  if (typeof IntersectionObserver !== 'function') {
    // IO が無い環境(古い WebView・テスト)では【即座に中身を作る】= フェイルソフト。
    // ★「観測できないから空のまま」は最悪の倒れ方(見えない失敗)。
    try { fill(); } catch { /* 描画を止めない */ }
    return;
  }
  const st = stateFor(laneEl);
  if (!st.observer) {
    // C5: スクロールは .nl-main 1本。無ければ viewport にフェイルソフト。
    const root = typeof laneEl.closest === 'function' ? laneEl.closest('.nl-main') : null;
    st.observer = new IntersectionObserver(
      (entries, obs) => {
        for (const ent of entries) {
          if (!ent.isIntersecting) continue;
          const target = ent.target;
          const run = st.pending.get(target);
          st.pending.delete(target);
          try { obs.unobserve(target); } catch { /* 解除失敗は握る */ }
          if (typeof run === 'function') {
            try { run(); } catch { /* fill 失敗は他のタイルを巻き込まない */ }
          }
        }
      },
      { root: root || null, rootMargin: LANE_CONTENT_LOD_ROOT_MARGIN }
    );
  }
  const key = String(userKey || '');
  st.pending.set(hollowEl, () => {
    if (key) st.filledKeys.add(key); // ★詰めた事実を記憶＝二度と hollow に戻さない
    fill();
  });
  try { st.observer.observe(hollowEl); } catch { /* 観測失敗は描画を止めない */ }
}

/**
 * 計器(観測のみ): いまこの段に hollow な枠が何個あるか。
 * ★状態速報が読む。「効いているか」を数で判定するため。
 * @param {HTMLElement} laneEl
 * @returns {number}
 */
export function countHollowTiles(laneEl) {
  if (!laneEl || typeof laneEl.querySelectorAll !== 'function') return 0;
  try {
    return laneEl.querySelectorAll(`.${LANE_CONTENT_LOD_HOLLOW_CLASS}`).length;
  } catch {
    return 0;
  }
}
