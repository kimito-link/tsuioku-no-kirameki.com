/**
 * サイドパネルを「どの配信に紐づけるか」を決める純関数。
 *
 * ★v0.1.1259 の背景(2026-08-05・過去の撤退記録から):
 *   background.js:3200 に実在するコメント:
 *     「0.1.67 (AW) では非 watch で chrome.sidePanel.open を試していたが、
 *       環境・タブ種別によってサイドパネルが空／未表示に見え
 *       『いつもの POP が出ない』となる報告があったため(略)常に popup 窓に戻す」
 *   さらに background.js:812 に抑止コードが現存:
 *     setPanelBehavior({ openPanelOnActionClick: false })
 *
 * ■ 「空に見えた」真因(コードと公式仕様から特定)
 *   1. sidepanel.html は静的HTMLで `?lv=` を持てない
 *      (popup-entry.js:1011「sidepanel は静的 HTML で lv を持たないので空のまま」)
 *   2. 配信IDの解決 pickWatchUrlFromMultipleSources は inlineParam を最優先するが、
 *      サイドパネルはそれが無いため activeTab に落ちる
 *   3. ★公式仕様: サイドパネルは既定で【全タブ共有】
 *      → 複数タブで別配信を見ていると前面タブの配信を掴む＝取り違え／空
 *
 * ■ 対処
 *   SW 側で setOptions({ tabId, path: 'sidepanel.html?lv=<id>' }) を使い、
 *   【タブ固有】のサイドパネルにする。この関数はその path を決める判断だけを担う。
 *   DOM も chrome API も触らない=テストで固定できる。
 *
 * ■ 設計の掟
 *   - 解決できないときに【推測で埋めない】。空を返し、呼び出し側が既定パスを使う。
 *     ("とりあえず前面タブ"が過去の事故そのものなので、ここでやらない)
 *   - どの情報源から決まったかを必ず返す(誤りを追跡できるようにする)
 */

/** 配信IDの形。`lv` + 数字のみを受け付ける。 */
const LIVE_ID_RE = /^lv\d{1,15}$/;

/**
 * URL から配信IDを取り出す。取り出せなければ ''。
 *
 * ★ドメインまで検証する。パスだけを見ると
 *   `https://example.com/watch/lv1` のような無関係(または悪意ある)URLから
 *   配信IDを拾ってしまう(テストで実際に検出した)。
 *   サイドパネルは全タブ共有が既定なので、無関係なタブのURLが渡りうる。
 *
 * @param {unknown} url
 * @returns {string}
 */
export function extractLiveIdForSidePanel(url) {
  const s = String(url ?? '').trim();
  if (!s) return '';
  let host = '';
  let path = '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    host = u.hostname.toLowerCase();
    path = u.pathname;
  } catch {
    return ''; // URL として解釈できないものは弾く
  }
  // nicovideo.jp か、そのサブドメインのみ許可。
  if (host !== 'nicovideo.jp' && !host.endsWith('.nicovideo.jp')) return '';
  const m = /^\/watch\/(lv\d{1,15})\/?$/i.exec(path);
  if (!m) return '';
  const lv = String(m[1] || '').toLowerCase();
  return LIVE_ID_RE.test(lv) ? lv : '';
}

/**
 * サイドパネルに設定する path を決める。
 *
 * @param {object} args
 * @param {unknown} [args.tabUrl] このタブのURL(SW が tabs.get で取得した実物)。最優先。
 * @param {unknown} [args.lastWatchUrl] 既存キー nls_last_watch_url の値。フォールバック。
 * @param {string} [args.basePath] 既定パス(既定 'sidepanel.html')。
 * @returns {{ path: string, liveId: string, source: 'tab'|'lastWatch'|'none' }}
 */
export function resolveSidePanelPath(args) {
  const base = String(args?.basePath || 'sidepanel.html');

  // 1. このタブ自身のURL。サイドパネルを開いたタブが watch なら、それが見たい配信。
  //    ★ここが「全タブ共有で前面タブを掴む」問題の対処。tabId 固有に設定する前提。
  const fromTab = extractLiveIdForSidePanel(args?.tabUrl);
  if (fromTab) {
    return { path: `${base}?lv=${fromTab}`, liveId: fromTab, source: 'tab' };
  }

  // 2. 最後に見た配信(既存キー)。comeview が既にこの手を使っている
  //    (background.js:1947「comeview 側は無指定なら nls_last_watch_url で自己解決」)。
  const fromLast = extractLiveIdForSidePanel(args?.lastWatchUrl);
  if (fromLast) {
    return { path: `${base}?lv=${fromLast}`, liveId: fromLast, source: 'lastWatch' };
  }

  // 3. 決められない → ★推測で埋めない。既定パスのまま返す。
  //    popup 側は従来どおり自前の解決順(pickWatchUrlFromMultipleSources)へ落ちる。
  return { path: base, liveId: '', source: 'none' };
}

/**
 * このタブでサイドパネルを有効化してよいか。
 * watch ページでないタブに出しても中身が無く「空に見える」ので出さない
 * (過去の撤退理由そのもの)。
 *
 * @param {unknown} tabUrl
 * @returns {boolean}
 */
export function shouldEnableSidePanelForTab(tabUrl) {
  return extractLiveIdForSidePanel(tabUrl) !== '';
}
