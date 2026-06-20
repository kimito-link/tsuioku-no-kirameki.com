/**
 * changelogLineage.js — changelog 全版を「バグ系統」で枝化する純関数(v0.1.841・修正系譜マップ 第1)。
 *
 * 背景(council/map-graphs-SYNTHESIS.md): エラー再発防止に最も効くのは「同系統のバグを過去にどう
 * 直したか」を即辿れること。実績=記録件数系は v0.1.792→804→838→839 と4回も触っている。changelog の
 * 177版(各 {version,date,summary,items})を系統で束ね、系統ごとに版を時系列で並べた「修正系譜」を作る。
 * これを地図に出せば「またこの系統だ・前回はこう直した」が一目で分かり、同じ轍を踏まない。
 *
 * 機械生成・腐らない(changelog.js から決定的生成)・人手辞書は系統語彙(下記)だけ最小。
 * 1版が複数系統に該当しうる(multi-tag)。どの系統にも当たらない版は 'その他' に入れる。
 * 設計正本=council/map-graphs-SYNTHESIS.md。副作用なし。
 */

/**
 * バグ系統の語彙(正解ラベル)。classifyFeatureCategory と整合させつつ changelog 文言に最適化。
 * key=系統表示名, value=summary+items に含まれれば該当とみなすキーワード(部分一致・大小無視はRE側で)。
 * @type {Array<{tag:string, re:RegExp}>}
 */
const LINEAGE_TAGS = [
  { tag: '💾 記録件数', re: /記録(件数|数|0)|件数|単調|減らない|0に潰れ|配信者除外|recordedCount/i },
  { tag: '📥 コメント取得', re: /取得|収穫|バックフィル|backfill|過去ログ|NDGR|匿名.*記録|本文記録|取りこぼし/i },
  { tag: '🙂 匿名(184)', re: /匿名|184|hashedUserId/i },
  { tag: '🏟 会場・席', re: /会場|席|来場|参加者|venue|群衆|満席/i },
  { tag: '🎈 吹き出し', re: /吹き出し|バルーン|bubble/i },
  { tag: '🎁 ギフト', re: /ギフト|gift|投擲|投げ/i },
  { tag: '🔊 読み上げ', re: /読み上げ|音声|VOICEVOX|ボイス|発話/i },
  { tag: '🪟 応援レーン・タイル', re: /レーン|応援アイコン|人物タイル|タイル|アバター|プロフィール/i },
  { tag: '🩺 診断・状態速報', re: /診断|状態速報|status|対処カード|マインドマップ|stale|誤警告|嘘/i },
  { tag: '🗺 地図・ドキュメント', re: /地図|マップ|逆引き|tree-map|feature-sitemap|code-tree|ナビ/i },
  { tag: '🧊 storage安定', re: /storage|stall|タイムアウト|timeout|RMW|spiral/i },
  { tag: '⚡ 描画・性能', re: /描画|paint|スクロール|重い|perf|フリッカ|遅延/i },
  { tag: '🔁 自己検証・規律', re: /自己検証|verify|ゲート|腐り|impact-check|version|bump|changelog整合/i }
];

/**
 * @typedef {{ version:string, date:string, summary:string, items:readonly string[] }} ChangelogEntryLike
 * @typedef {{ tag:string, versions: {version:string, date:string, summary:string}[] }} LineageBranch
 */

/**
 * 1版がどの系統に該当するかを返す(複数可)。
 * @param {ChangelogEntryLike} entry
 * @returns {string[]} 該当系統タグの配列(0件なら空)
 */
export function tagsForChangelogEntry(entry) {
  if (!entry || typeof entry !== 'object') return [];
  const text = `${entry.summary ?? ''} ${Array.isArray(entry.items) ? entry.items.join(' ') : ''}`;
  const tags = [];
  for (const { tag, re } of LINEAGE_TAGS) {
    if (re.test(text)) tags.push(tag);
  }
  return tags;
}

/**
 * changelog 全版を系統で束ねた「修正系譜」を返す。系統内は changelog の並び順(新しい順)を保つ。
 * どの系統にも当たらない版は 'その他' 系統に入れる(取りこぼしを地図から隠さない)。
 * @param {readonly ChangelogEntryLike[]} changelog
 * @returns {LineageBranch[]} 系統ごと(LINEAGE_TAGS の順 + 'その他')。空の系統は返さない。
 */
export function buildChangelogLineage(changelog) {
  if (!Array.isArray(changelog)) return [];
  /** @type {Map<string, {version:string, date:string, summary:string}[]>} */
  const byTag = new Map();
  const ORDER = [...LINEAGE_TAGS.map((t) => t.tag), 'その他'];
  for (const t of ORDER) byTag.set(t, []);
  for (const entry of changelog) {
    if (!entry || typeof entry !== 'object') continue;
    const slim = {
      version: String(entry.version ?? ''),
      date: String(entry.date ?? ''),
      summary: String(entry.summary ?? '')
    };
    const tags = tagsForChangelogEntry(entry);
    if (tags.length === 0) {
      byTag.get('その他').push(slim);
    } else {
      for (const t of tags) byTag.get(t).push(slim);
    }
  }
  return ORDER
    .map((tag) => ({ tag, versions: byTag.get(tag) }))
    .filter((b) => b.versions.length > 0);
}
