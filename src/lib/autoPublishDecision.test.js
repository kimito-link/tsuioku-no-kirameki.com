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

import { latestPublishTime } from './autoPublishDecision.js';

describe('latestPublishTime(送信の連打を止める)', () => {
  it('★記録と自分の送信開始時刻の新しい方を返す・どちらも無ければ 0', () => {
    expect(latestPublishTime(1000, 5000)).toBe(5000);
    expect(latestPublishTime(9000, 5000)).toBe(9000);
    expect(latestPublishTime(0, 0)).toBe(0);
    expect(latestPublishTime(undefined, null)).toBe(0);
    expect(latestPublishTime(-5, 'x')).toBe(0);
  });
  it('★再現: 記録が古いままでも、自分の送信開始時刻を使えば、2秒ごとの描画で連打しない(2分に1回)', () => {
    const interval = DEFAULT_AUTO_PUBLISH_INTERVAL_MS;
    const staleRecordAt = 1_000; // 記録は12秒間引きで古いまま
    const run = (useLaunched) => {
      let launchedAt = 0; let posts = 0;
      for (let t = 200_000; t <= 200_000 + 20_000; t += 2_000) {
        const d = shouldAutoPublish({
          optedIn: true, hasKeys: true, hasPayload: true, hasWatchTab: true, inFlight: false, everSent: true,
          lastSentAtMs: useLaunched ? latestPublishTime(staleRecordAt, launchedAt) : staleRecordAt,
          nowMs: t, intervalMs: interval
        });
        if (d.publish) { posts += 1; launchedAt = t; }
      }
      return posts;
    };
    expect(run(false)).toBeGreaterThan(5); // 旧: 20秒間に6回以上=連打
    expect(run(true)).toBe(1); // 新: 1回だけ
  });
});

import { CHANGED_AUTO_PUBLISH_INTERVAL_MS } from './autoPublishDecision.js';

describe('shouldAutoPublish — 中身が変わったときだけ短い間隔(v0.1.1729 スマホ化 第1段)', () => {
  const recent = { ...base, nowMs: base.lastSentAtMs + CHANGED_AUTO_PUBLISH_INTERVAL_MS };
  it('中身が変わっていて20秒たてば送る', () => {
    expect(shouldAutoPublish({ ...recent, changed: true })).toEqual({ publish: true, reason: 'changed' });
  });
  it('中身が変わっていても20秒未満なら送らない(連打しない)', () => {
    expect(shouldAutoPublish({ ...recent, changed: true, nowMs: base.lastSentAtMs + 19_999 }).publish).toBe(false);
  });
  it('中身が同じなら20秒では送らず、120秒の生存確認まで待つ', () => {
    expect(shouldAutoPublish({ ...recent, changed: false }).reason).toBe('fresh_enough');
    expect(shouldAutoPublish({ ...recent }).reason).toBe('fresh_enough'); // 不明=同じ扱い
    expect(shouldAutoPublish({ ...recent, changed: 'yes' }).reason).toBe('fresh_enough');
  });
  it('★同意が無ければ中身が変わっていても送らない(最優先ゲートは不変)', () => {
    expect(shouldAutoPublish({ ...recent, changed: true, optedIn: false }).reason).toBe('no_consent');
    expect(shouldAutoPublish({ ...recent, changed: true, hasWatchTab: false }).reason).toBe('no_watch');
    expect(shouldAutoPublish({ ...recent, changed: true, inFlight: true }).reason).toBe('in_flight');
  });
  it('短い間隔は生存確認の間隔より長くならない', () => {
    expect(
      shouldAutoPublish({ ...base, changed: true, intervalMs: 10_000, changedIntervalMs: 60_000, nowMs: base.lastSentAtMs + 10_000 }).publish
    ).toBe(true);
  });
});

import { changedIntervalWithBackoff } from './autoPublishDecision.js';

describe('送信失敗が続いたら間隔を広げる(v0.1.1729)', () => {
  it('20→40→80→120秒(上限は生存確認の120秒)', () => {
    const f = (n) => changedIntervalWithBackoff(20_000, 120_000, n);
    expect([f(0), f(1), f(2), f(3), f(9), f(undefined), f(-1)]).toEqual([20_000, 40_000, 80_000, 120_000, 120_000, 20_000, 20_000]);
  });
  it('★2回続けて失敗していると、中身が変わっていても80秒までは送らない', () => {
    const at = (ms) => shouldAutoPublish({ ...base, changed: true, failStreak: 2, nowMs: base.lastSentAtMs + ms });
    expect(at(79_999).publish).toBe(false);
    expect(at(80_000)).toEqual({ publish: true, reason: 'changed' });
  });
  it('★変化が20秒ごとに続いても、送信中は次を始めない(重ならない)', () => {
    let inFlight = false; let started = 0; let lastAt = 1_000;
    for (let t = 21_000; t <= 200_000; t += 2_000) {
      const d = shouldAutoPublish({ ...base, changed: true, inFlight, lastSentAtMs: lastAt, nowMs: t });
      if (d.publish) { started += 1; inFlight = true; lastAt = t; }
      if (inFlight && t - lastAt >= 30_000) inFlight = false; // 送信に30秒かかる遅い回線
    }
    // 30秒かかる送信が終わるまで次を始めないので、20秒間隔より少ない回数になる
    expect(started).toBeLessThanOrEqual(Math.ceil(180_000 / 30_000));
  });
});

import { readPublishAck, VIEWER_ACTIVE_STICKY_MS } from './autoPublishDecision.js';
describe('readPublishAck(v0.1.1738)', () => {
  it('viewerActive:true なら次の送信(最長120秒)の返事まで持つ期限を返す', () => {
    expect(VIEWER_ACTIVE_STICKY_MS).toBeGreaterThan(120_000);
    expect(readPublishAck({ ok: true, viewerActive: true, gzipOk: true }, 1000)).toEqual({ viewingUntilMs: 1000 + VIEWER_ACTIVE_STICKY_MS, gzipOk: true, voiceWanted: false });
  });
  it('false・返さない古いサーバー・壊れた返事はどちらも false(gzip を解けない受け口に送らない)', () => {
    expect(readPublishAck({ ok: true, viewerActive: false, gzipOk: true }, 1000)).toEqual({ viewingUntilMs: 0, gzipOk: true, voiceWanted: false });
    expect(readPublishAck({ ok: true }, 1000)).toEqual({ viewingUntilMs: 0, gzipOk: false, voiceWanted: false });
    expect(readPublishAck(null, 1000)).toEqual({ viewingUntilMs: 0, gzipOk: false, voiceWanted: false });
    expect(readPublishAck({ ok: true, voiceWanted: true }, 1000).voiceWanted).toBe(true);
    expect(readPublishAck({ gzipOk: 'yes', viewerActive: 1 }, 1000)).toEqual({ viewingUntilMs: 0, gzipOk: false, voiceWanted: false });
  });
});
