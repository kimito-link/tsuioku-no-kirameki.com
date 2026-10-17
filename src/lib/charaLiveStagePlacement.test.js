/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import {
  CHARA_LIVE_COMPACT_SIZE_PX,
  CHARA_LIVE_PLACEMENT,
  CHARA_LIVE_SIZE_PX,
  buildCharaLiveStageDom,
  charaLiveStageCss
} from './charaLiveStage.js';

/**
 * 2026-10-17: ゆっくり3人の居場所。右下固定だと幅385pxで PICK UP 枠・映像の下端を覆って邪魔だった(ユーザー要望)。
 *   既定を上端(会場ステージの上の余白)・64px にする。1行(CHARA_LIVE_PLACEMENT)で従来の右下へ戻せる。
 */
describe('3人の居場所(placement)', () => {
  it('★既定は上端・64px(従来の116pxの右下は定数として残す=戻せる)', () => {
    expect(CHARA_LIVE_PLACEMENT).toBe('top');
    expect(CHARA_LIVE_COMPACT_SIZE_PX).toBe(64);
    expect(CHARA_LIVE_SIZE_PX).toBe(116);
  });
  it('★DOM のルートに data-placement が付く(CSS がこれで配置を切り替える)', () => {
    const { root } = buildCharaLiveStageDom(document, (p) => p);
    expect(root.dataset.placement).toBe(CHARA_LIVE_PLACEMENT);
  });
  const css = charaLiveStageCss();
  it('★上端配置の CSS: 上に寄せ・下の指定を外し・立ち絵を64pxにする', () => {
    expect(css).toMatch(/\.nlcl-stage\[data-placement="top"\] \{\s*top: 4px;\s*bottom: auto;/);
    expect(css).toMatch(/\.nlcl-stage\[data-placement="top"\] \.nlcl-chara \{\s*width: 64px;\s*height: 64px;/);
  });
  it('★吹き出しと「…」は上端配置では下向き(画面外に出ない)・しっぽも反転', () => {
    expect(css).toMatch(/\[data-placement="top"\] \.nlcl-chara__bubble,\s*\.nlcl-stage\[data-placement="top"\] \.nlcl-chara__think \{\s*top: calc\(100% \+ 6px\);\s*bottom: auto;/);
    expect(css).toMatch(/\[data-placement="top"\] \.nlcl-chara__bubble::after \{\s*top: auto;\s*bottom: 100%;/);
  });
  it('従来の右下配置(ベースの .nlcl-stage {})は変えていない・pointer-events:none も維持', () => {
    expect(css).toMatch(/\.nlcl-stage \{[\s\S]*?right: 12px;\s*bottom: 12px;[\s\S]*?pointer-events: none;/);
    expect(css).toContain(`width: ${CHARA_LIVE_SIZE_PX}px;`);
  });
});
