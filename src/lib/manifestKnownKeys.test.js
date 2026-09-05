import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(here, '../../extension/manifest.json'), 'utf8')
);

/**
 * manifest.json に「Chrome 拡張が認識しないキー」を増やさないための関所。
 *
 * ★なぜ要るか(2026-08-10 実機で警告を出した):
 *   サイドパネル出現時の黒対策として `theme_color` を追加したが、これは
 *   Web App Manifest のキーであって【Chrome 拡張の manifest では未対応】。
 *   実機で `Unrecognized manifest key 'theme_color'.` の警告が出て、
 *   拡張カードに黄色い「警告」ボタンが付いた（ストア審査でも印象が悪い）。
 *
 *   ユニットテストも lint も typecheck も、この誤りを1つも捕まえられなかった。
 *   JSON に自由なキーを足せてしまうため＝許可リストで塞ぐ。
 *
 * ★キーを増やすときは、まず Chrome の公式 manifest キー一覧で確認し、
 *   ここに足してから使うこと（実機の警告まで見るのが最終確認）。
 */
const KNOWN_MV3_KEYS = new Set([
  'manifest_version',
  'name',
  'version',
  'description',
  'icons',
  'action',
  'background',
  'content_scripts',
  'content_security_policy',
  'permissions',
  'optional_permissions',
  'host_permissions',
  'optional_host_permissions',
  'web_accessible_resources',
  'side_panel',
  'options_page',
  'options_ui',
  'commands',
  'default_locale',
  'devtools_page',
  'externally_connectable',
  'homepage_url',
  'incognito',
  'key',
  'minimum_chrome_version',
  'offline_enabled',
  'omnibox',
  'short_name',
  'storage',
  'update_url',
  'declarative_net_request',
  'chrome_url_overrides',
  'author',
  'version_name'
]);

describe('manifest.json のキーは Chrome 拡張が認識するものだけ', () => {
  it('★未知のキーが無い(実機の「Unrecognized manifest key」警告を防ぐ)', () => {
    const unknown = Object.keys(manifest).filter((k) => !KNOWN_MV3_KEYS.has(k));
    expect(
      unknown,
      `Chrome が認識しない manifest キー: ${unknown.join(', ')}\n` +
        '公式のキー一覧で確認し、正しければ KNOWN_MV3_KEYS に追加すること。' +
        '（2026-08-10 に theme_color を入れて実機警告を出した実績あり）'
    ).toEqual([]);
  });

  it('side_panel は default_path だけを持つ(想定外のサブキーを増やさない)', () => {
    expect(Object.keys(manifest.side_panel || {})).toEqual(['default_path']);
  });
});
