/**
 * nameplateToggleBoot.js — ①POP の「なふだ」ボタンを配線する(副作用モジュール)。
 *
 * ★なぜ lib 側に置くか
 *   popup-entry.js は max-lines 上限(22343行)に**ちょうど張り付いて**いて、
 *   1行も足せない。呼ぶ側は `import './nameplateToggleBoot.js'` の1行だけにする。
 *
 * ★状態を拡張側に保存しない
 *   「なふだ」は**公式の設定**であって拡張の設定ではない。
 *   拡張が別に真偽値を持つと、公式UIで変えられた瞬間に食い違い、
 *   「ONにしたのに反映されない」という嘘の表示を作る
 *   ([[shared-key-needs-a-consumer-registry-2026-08-06]] と同型の事故)。
 *   ＝**押す→公式の結果を表示する**だけにする。
 *
 * @module nameplateToggleBoot
 */

/**
 * 押した結果をユーザーの言葉に直す。
 * @param {any} res
 * @returns {string}
 */
export function describeNameplateResult(res) {
  if (!res || typeof res !== 'object') {
    return '切り替えできませんでした（watchタブが見つかりません）';
  }
  if (res.ok && res.reason === 'already') {
    return res.current ? 'すでに表示中です' : 'すでに隠れています';
  }
  if (res.ok) {
    return res.changedTo ? '表示にしました' : '隠しました';
  }
  return String(res.error || '切り替えできませんでした');
}

/**
 * watch タブへ「なふだ」の切替を依頼する。
 * @param {boolean} on
 * @returns {Promise<any>}
 */
async function requestNameplate(on) {
  try {
    const tabs = await chrome.tabs.query({
      url: ['https://live.nicovideo.jp/watch/*', 'https://sp.live.nicovideo.jp/watch/*']
    });
    const tab = (tabs || []).find((t) => Number.isFinite(Number(t?.id)));
    if (!tab) return { ok: false, error: '配信のタブが開いていません' };
    return await chrome.tabs.sendMessage(tab.id, { type: 'NLS_NAMEPLATE_TOGGLE', on });
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

/**
 * ★v0.1.1478: 入口は【2つ】ある。
 *
 *   詳細設定の中(#nameplateOnBtn / #nameplateOffBtn)
 *   ★コメント入力のすぐ上(#nameplateOnBtnInline / #nameplateOffBtnInline)
 *
 * ★なぜ2つ目を足したか(ユーザー指摘)
 *   「コメントうつんだからこのそばにないとわからない」
 *   ＝ なふだは【コメントを打つときに決めること】。
 *   v0.1.1477 で設定の見出しに名前を出したが、それでも足りなかった。
 *   ★名前を出すだけでなく【使う場所へ置く】必要があった。
 *
 * ★どちらを押しても同じ処理。結果はそれぞれの note に出す
 *   (押した場所に答えが出ないと、押せたのか分からない)。
 */
const NAMEPLATE_ENTRY_POINTS = Object.freeze([
  { onId: 'nameplateOnBtn', offId: 'nameplateOffBtn', noteId: 'nameplateToggleNote' },
  {
    onId: 'nameplateOnBtnInline',
    offId: 'nameplateOffBtnInline',
    noteId: 'nameplateToggleNoteInline'
  }
]);

try {
  const doc = typeof document !== 'undefined' ? document : null;
  if (doc) {
    for (const ep of NAMEPLATE_ENTRY_POINTS) {
      const note = doc.getElementById(ep.noteId);
      /** @param {string} id @param {boolean} on */
      const bind = (id, on) => {
        const btn = doc.getElementById(id);
        if (!btn) return;
        btn.addEventListener('click', () => {
          if (note) note.textContent = '切り替え中…';
          void requestNameplate(on).then((res) => {
            if (note) note.textContent = describeNameplateResult(res);
          });
        });
      };
      bind(ep.onId, true);
      bind(ep.offId, false);
    }
  }
} catch {
  /* 配線に失敗しても popup は出す */
}
