import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('配線: スマホから生放送にコメントを届ける(v0.1.1734)', () => {
  const popup = read('./popup-entry.js');
  const status = read('./status-entry.js');
  const liveView = read('../../app/live-view.js');

  it('★popup の送信は、スマホの WEB版(受動ビュー+口あり)のときだけ PC 中継に切り替わる=拡張の送信経路は不変', () => {
    expect(popup).toMatch(/const r = INLINE_PASSIVE \? \/\*\* @type \{any\} \*\/ \(globalThis\)\.__nlsWebCommentRelay : null;/);
    expect(popup).toMatch(/const relay = webCommentRelay\(\);\n\s+if \(relay\) \{/);
    expect(popup).toMatch(/await relay\.post\(text, COMMENT_POST_UI_STATE\.liveId\)/);
  });

  it('★WEB版では「届いた」と言わない(預けた時点の文言は ⏱)・Enter で送らない', () => {
    expect(popup).toContain("setCommentPostNotice('⏱ PCに渡しました。放送に流れたら ✓✓ が付きます。', 'success')");
    expect(popup).toMatch(/enterSendsComment: Boolean\(commentEnterSend\?\.checked\) && !webCommentRelay\(\)/);
  });

  it('★受け取って投稿する係は送信担当(?publisher=1)だけで動く=二重に投稿しない', () => {
    expect(status).toMatch(/if \(IS_STATUS_PUBLISHER\) startPhonePostRelay\(\{/);
  });

  it('★同意(📱 スマホで見る)を OFF にすると、スマホからのコメントも止める', () => {
    expect(status).toMatch(/if \(!value\) await disablePhonePost\(getPublishCredentials\(getUploadConfig\(\)\)\);/);
  });

  it('★WEB版: 投稿用の鍵は popup を起動する前に口として置く・放送のコメントで ✓✓ を付ける', () => {
    const iKey = liveView.indexOf('globalThis.__nlsWebCommentRelay = _postClient;');
    const iBoot = liveView.indexOf('bootWithSnapshot(token).catch(');
    expect(iKey).toBeGreaterThan(0);
    expect(iKey).toBeLessThan(iBoot);
    expect(liveView).toContain('_postClient.updateSeen(restoreCommentTimelineRows(');
  });
});
