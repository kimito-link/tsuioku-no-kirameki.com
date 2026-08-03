import { describe, it, expect } from 'vitest';
import { shouldAutoPublish, DEFAULT_AUTO_PUBLISH_INTERVAL_MS } from './autoPublishDecision.js';

const base = {
  // ★v0.1.1242: optedIn を明示しないと publish されない(既定OFF)。既存ケースは
  //   「同意済みの利用者」を前提にした判定を見ているので true を置く。
  optedIn: true,
  hasKeys: true,
  hasPayload: true,
  hasWatchTab: true,
  inFlight: false,
  everSent: true,
  lastSentAtMs: 1_000_000,
  nowMs: 1_000_000 + DEFAULT_AUTO_PUBLISH_INTERVAL_MS,
  intervalMs: DEFAULT_AUTO_PUBLISH_INTERVAL_MS
};

/**
 * ★v0.1.1242(CWS提出ブロッカー BLOCKING-1)の回帰テスト。
 *
 * 旧実装のゲートは hasKeys/hasPayload/hasWatchTab/inFlight の4つだけで、
 * **同意の条件が一つも無かった**。その結果 status ページを開いて視聴しているだけで
 * 120秒ごとに視聴者のユーザーID・名前・コメント本文が外部サーバーへ自動送信されていた。
 * privacy.html / 提出テキスト / 説明文の4文書はいずれも「自動送信しない」と明記しており、
 * 実挙動と開示が真逆だった(CWS User Data Policy 違反=アイテム停止級)。
 * AGENTS.md §53「データ送信は利用者の明確な同意(オプトイン)に基づく」にも違反していた。
 *
 * 不変条件: **同意していない限り、他のどの条件が揃っても publish は false**。
 */
describe('shouldAutoPublish — 同意(オプトイン)が最優先ゲート', () => {
  it('optedIn 未指定なら、他が全部揃っていても送らない(既定OFF)', () => {
    const noConsent = { ...base };
    delete noConsent.optedIn;
    expect(shouldAutoPublish(noConsent)).toEqual({ publish: false, reason: 'no_consent' });
  });

  it('optedIn:false なら送らない', () => {
    expect(shouldAutoPublish({ ...base, optedIn: false }).reason).toBe('no_consent');
  });

  it('同意は初回送信(first_publish)より優先される=未同意なら初回すら送らない', () => {
    const r = shouldAutoPublish({ ...base, optedIn: false, everSent: false, lastSentAtMs: 0 });
    expect(r.publish).toBe(false);
    expect(r.reason).toBe('no_consent');
  });

  it('optedIn:true かつ他条件が揃えば従来どおり送る', () => {
    expect(shouldAutoPublish(base).publish).toBe(true);
  });

  it('optedIn は真偽値のみ受け付ける("true"等の紛れで同意扱いにしない)', () => {
    expect(shouldAutoPublish({ ...base, optedIn: 'true' }).reason).toBe('no_consent');
    expect(shouldAutoPublish({ ...base, optedIn: 1 }).reason).toBe('no_consent');
  });
});

describe('shouldAutoPublish — 誤発射しない前提条件', () => {
  it('キー未設定なら false', () => {
    expect(shouldAutoPublish({ ...base, hasKeys: false })).toEqual({ publish: false, reason: 'no_keys' });
  });
  it('payload 未組成なら false', () => {
    expect(shouldAutoPublish({ ...base, hasPayload: false }).reason).toBe('no_payload');
  });
  it('watch タブが無いなら false(止まった状態を送り続けない)', () => {
    expect(shouldAutoPublish({ ...base, hasWatchTab: false }).reason).toBe('no_watch');
  });
  it('送信中なら false(多重防止)', () => {
    expect(shouldAutoPublish({ ...base, inFlight: true }).reason).toBe('in_flight');
  });
  it('null 入力でも落ちず false', () => {
    expect(shouldAutoPublish(null).publish).toBe(false);
  });
});

describe('shouldAutoPublish — 送るべきとき', () => {
  it('まだ一度も送っていないなら true(初回)', () => {
    expect(shouldAutoPublish({ ...base, everSent: false })).toEqual({ publish: true, reason: 'first_publish' });
  });
  it('everSent でも lastSentAtMs=0 なら初回扱いで true', () => {
    expect(shouldAutoPublish({ ...base, lastSentAtMs: 0 }).reason).toBe('first_publish');
  });
  it('前回送信から interval 以上経過なら true', () => {
    expect(shouldAutoPublish({ ...base, nowMs: base.lastSentAtMs + DEFAULT_AUTO_PUBLISH_INTERVAL_MS + 1 })).toEqual({
      publish: true,
      reason: 'interval_elapsed'
    });
  });
  it('直近失敗でも interval 経過なら再試行(回復)', () => {
    // lastOk は入力に無い=判定は時刻ベースのみ。interval 経過していれば送る。
    expect(shouldAutoPublish({ ...base }).publish).toBe(true);
  });
});

describe('shouldAutoPublish — まだ送らないとき', () => {
  it('interval 未満なら false(新鮮=打たない)', () => {
    expect(shouldAutoPublish({ ...base, nowMs: base.lastSentAtMs + 1000 })).toEqual({
      publish: false,
      reason: 'fresh_enough'
    });
  });
  it('nowMs 不明(0)なら false(誤発射しない)', () => {
    expect(shouldAutoPublish({ ...base, nowMs: 0 }).reason).toBe('no_now');
  });
});
