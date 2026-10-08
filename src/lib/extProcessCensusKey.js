/**
 * 拡張プロセスの忙しさ台帳の storage キーとメッセージ型(書き手と読み手が同じ名前を使うための1か所)。
 *
 * ★書き手は Service Worker(src/extension/ext-census-sw.js)のみ / 読み手は status(状態速報)のみ。
 *   各拡張文書(popup・サイドパネル・status・会場・コメビュ…)は storage に書かず、
 *   runtime.sendMessage で SW へ要約を送るだけ(診断の書き込み元を1本に絞る)。
 * ★このキーは「描き直す理由にならない」診断なので selfWrittenStorageKeys.js に登録する
 *   (未登録だと popup 全インスタンスが書き込みのたびに無スロットルで refresh する)。
 */
export const KEY_EXT_PROCESS_CENSUS = 'nls_ext_process_census_v1';

/** 各拡張文書 → Service Worker の報告メッセージ型。 */
export const EXT_CENSUS_MESSAGE_TYPE = 'NLS_DOC_CENSUS';
