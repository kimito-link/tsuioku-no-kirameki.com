import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * ★v0.1.1425 配線テスト: 「会場が開いている」を**書く側が存在するか**。
 *
 * ■ なぜこの検査が要るか(1年近く誰も気づかなかった穴)
 *   v0.1.1394 は「①POPが隠れていても会場が開いていれば鏡を書く」と根治した。
 *   判定(hiddenPublishPolicy)も読み手(venueOpenCache)も正しく在った。
 *   ★しかし【書き手】が venueBar.js でコメントアウトされており、
 *     venueOpen は永久に false=分岐が一度も通らなかった。
 *   実機(2026-08-17): 会場は3人なのに `鏡stale(656s) … tanu332`。
 *   ＝読み手だけを検査しても穴は見つからない。**書き手の実在**を固定する
 *     ([[gate-fixture-must-come-from-the-writer-2026-08-07]])。
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const venueBar = readFileSync(join(root, 'src', 'extension', 'venueBar.js'), 'utf8');
const venueOpenCache = readFileSync(join(root, 'src', 'lib', 'venueOpenCache.js'), 'utf8');
const popupEntry = readFileSync(join(root, 'src', 'extension', 'popup-entry.js'), 'utf8');

/** コメント行を除いた実コードだけを見る(コメントアウトを「実装あり」と誤認しないため)。 */
const liveCode = venueBar
  .split(/\r?\n/)
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  })
  .join('\n');

describe('会場「いま開いている」の配線', () => {
  it('★★書き手が実在する(コメントアウトではない)', () => {
    expect(venueBar).toMatch(
      /import\s*\{[^}]*KEY_VENUE_LIVE_OPEN[^}]*\}\s*from\s*'\.\.\/lib\/venueLiveOpenFlag\.js'/
    );
    // 実際に storage へ書く行が【生きている】こと。
    // ★行頭が // の行は数えない(まさにそれで1年壊れていたため)。
    expect(
      /KEY_VENUE_LIVE_OPEN\]?\s*:\s*buildVenueLiveOpenValue/.test(liveCode),
      'venueBar.js に生きた storage.set が無い'
    ).toBe(true);
  });

  it('★開いたら書き、閉じたら書き直す(両方向)', () => {
    expect(liveCode).toMatch(/const startAggregation[\s\S]{0,300}?startVenueLiveOpenHeartbeat\(\)/);
    expect(liveCode).toMatch(/const stopAggregation[\s\S]{0,200}?stopVenueLiveOpenHeartbeat\(\)/);
  });

  it('★ハートビートがある(クラッシュ時の残骸を残さない)', () => {
    expect(liveCode).toMatch(/setInterval\(\s*\(\)\s*=>\s*writeVenueLiveOpen\(true\)/);
  });

  it('★読み手が現在状態キーを購読している', () => {
    expect(venueOpenCache).toMatch(
      /import\s*\{[^}]*KEY_VENUE_LIVE_OPEN[^}]*\}\s*from\s*'\.\/venueLiveOpenFlag\.js'/
    );
    expect(venueOpenCache).toMatch(/KEY_VENUE_LIVE_OPEN in changes/);
  });

  it('★供給側(①POP)が判定を使い続けている(v0.1.1394 の根治を壊さない)', () => {
    expect(popupEntry).toMatch(
      /decideHiddenWork\(\{\s*docHidden:\s*true,\s*venueOpen:\s*isVenueOpenCached\(\)\s*\}\)\.publish/
    );
  });

  it('★復元用の旧キーは復活させていない(ユーザー要望「復元しない」を守る)', () => {
    expect(
      /OPEN_STORAGE_KEY\]\s*:\s*open/.test(liveCode),
      '復元用キーへの書き込みが復活している'
    ).toBe(false);
  });
});
