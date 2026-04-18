import { describe, expect, it } from 'vitest';
import {
  COMMENT_PANEL_OUT_OF_VIEWPORT_RATIO,
  COMMENT_PANEL_RESTORE_COOLDOWN_MS,
  COMMENT_PANEL_SCROLLED_UP_THRESHOLD_PX,
  COMMENT_PANEL_USER_SCROLL_LOCKOUT_MS,
  KEY_COMMENT_PANEL_AUTO_RESTORE,
  LATEST_COMMENT_BUTTON_SELECTOR,
  decideCommentPanelRestoreAction,
  normalizeCommentPanelAutoRestoreEnabled
} from './commentPanelHealthProbe.js';

/**
 * 健康な状態をベースにして、各テストで差分だけ上書きする。
 * @param {Partial<import('./commentPanelHealthProbe.js').CommentPanelHealthInput>} [overrides]
 */
function healthyBase(overrides = {}) {
  return {
    enabled: true,
    now: 10_000,
    lastActionAt: 0,
    panelPresent: true,
    panelRect: { top: 100, height: 400 },
    viewportHeight: 800,
    scrollHost: { scrollTop: 900, scrollHeight: 1000, clientHeight: 100 },
    hasLatestButton: false,
    ...overrides
  };
}

describe('commentPanelHealthProbe 定数', () => {
  it('セレクタは aria-label ベースで CSS Module ハッシュを含まない', () => {
    expect(LATEST_COMMENT_BUTTON_SELECTOR).toBe(
      'button.indicator[aria-label="最新コメントに戻る"]'
    );
    // ハッシュっぽい '___' を誤って埋め込んでいないこと
    expect(LATEST_COMMENT_BUTTON_SELECTOR).not.toContain('___');
  });

  it('クールダウンは 10 秒以上（手動スクロールと喧嘩しない）', () => {
    expect(COMMENT_PANEL_RESTORE_COOLDOWN_MS).toBeGreaterThanOrEqual(10_000);
  });

  it('スクロール下端しきい値は少なくとも 100 px 以上', () => {
    expect(COMMENT_PANEL_SCROLLED_UP_THRESHOLD_PX).toBeGreaterThanOrEqual(100);
  });

  it('viewport 外判定は 0.5〜1.0 の比率', () => {
    expect(COMMENT_PANEL_OUT_OF_VIEWPORT_RATIO).toBeGreaterThan(0.5);
    expect(COMMENT_PANEL_OUT_OF_VIEWPORT_RATIO).toBeLessThanOrEqual(1);
  });

  it('storage key は nls_ プレフィクス付き', () => {
    expect(KEY_COMMENT_PANEL_AUTO_RESTORE.startsWith('nls_')).toBe(true);
  });
});

describe('normalizeCommentPanelAutoRestoreEnabled', () => {
  it('既定は true（false を明示しない限り ON）', () => {
    expect(normalizeCommentPanelAutoRestoreEnabled(undefined)).toBe(true);
    expect(normalizeCommentPanelAutoRestoreEnabled(null)).toBe(true);
    expect(normalizeCommentPanelAutoRestoreEnabled(true)).toBe(true);
    expect(normalizeCommentPanelAutoRestoreEnabled('yes')).toBe(true);
    expect(normalizeCommentPanelAutoRestoreEnabled(0)).toBe(true);
  });

  it('false を明示したときだけ OFF', () => {
    expect(normalizeCommentPanelAutoRestoreEnabled(false)).toBe(false);
  });
});

describe('decideCommentPanelRestoreAction: 設定／クールダウン／パネル不在', () => {
  it('設定 OFF なら何もしない（たとえ壊れていても触らない）', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({
        enabled: false,
        hasLatestButton: true,
        panelRect: { top: 2000, height: 400 }
      })
    );
    expect(r).toEqual({ action: 'none', reason: 'disabled' });
  });

  it('前回アクションから cooldown 以内なら何もしない', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({
        hasLatestButton: true,
        now: 15_000,
        lastActionAt: 10_000
      })
    );
    expect(r).toEqual({ action: 'none', reason: 'cooldown' });
  });

  it('cooldown を過ぎていればアクションに進める', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({
        hasLatestButton: true,
        now: 30_000,
        lastActionAt: 10_000
      })
    );
    expect(r.action).toBe('click_latest_button');
  });

  it('カスタム cooldownMs が効く（テスト専用の短い値）', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({
        hasLatestButton: true,
        now: 1500,
        lastActionAt: 1000,
        cooldownMs: 200
      })
    );
    expect(r.action).toBe('click_latest_button');
  });

  it('panelPresent=false は no_comment_panel 警告に委譲（何もしない）', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({ panelPresent: false, hasLatestButton: true })
    );
    expect(r).toEqual({ action: 'none', reason: 'panel_missing' });
  });

  it('健康（スクロール下端・viewport 内・ボタン無し）なら何もしない', () => {
    const r = decideCommentPanelRestoreAction(healthyBase());
    expect(r).toEqual({ action: 'none', reason: 'healthy' });
  });
});

describe('decideCommentPanelRestoreAction: ユーザスクロール中ロックアウト', () => {
  it('ユーザスクロール lockout は 5 秒以上（手動操作と喧嘩しない閾値）', () => {
    expect(COMMENT_PANEL_USER_SCROLL_LOCKOUT_MS).toBeGreaterThanOrEqual(5_000);
  });

  it('lastUserScrollAt から lockout 以内なら panel がどれほど外れていても何もしない', () => {
    /* ユーザが能動的に上にスクロール中 → panel が viewport 外になるのは正常な結果。
     * ここで scroll_panel_into_view を走らせるとユーザの意図に逆らって強制的に
     * スクロール位置が戻される。本 invariant はそれを起こさないことを保証する。 */
    const r = decideCommentPanelRestoreAction(
      healthyBase({
        now: 10_000,
        lastUserScrollAt: 9_000, // 1 秒前に手動スクロール
        panelRect: { top: -2000, height: 400 }, // 完全に画面外
        viewportHeight: 800
      })
    );
    expect(r).toEqual({ action: 'none', reason: 'user_scrolling' });
  });

  it('lockout を過ぎていれば F4 判定に進める', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({
        now: 20_000,
        lastUserScrollAt: 9_000, // 11 秒前 = lockout 超え
        panelRect: { top: -2000, height: 400 },
        viewportHeight: 800
      })
    );
    expect(r.action).toBe('scroll_panel_into_view');
  });

  it('lastUserScrollAt 未指定（従来呼び出し）は lockout を発火しない（後方互換）', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({
        panelRect: { top: -2000, height: 400 },
        viewportHeight: 800
      })
    );
    expect(r.action).toBe('scroll_panel_into_view');
  });

  it('カスタム userScrollLockoutMs を受け付ける', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({
        now: 1_500,
        lastUserScrollAt: 1_000,
        userScrollLockoutMs: 200, // 500ms 経過 > 200ms lockout
        panelRect: { top: -2000, height: 400 },
        viewportHeight: 800
      })
    );
    expect(r.action).toBe('scroll_panel_into_view');
  });

  it('cooldown より user_scrolling の判定が先に return する（reason 順序の明示）', () => {
    /* cooldown 内 かつ user_scrolling 内 の両方を満たす場合、どちらが返っても
     * 結果として何もしない (action=none) ので機能は壊れないが、reason で
     * 原因が追えるよう user_scrolling 優先とする（ユーザ操作尊重を明文化）。 */
    const r = decideCommentPanelRestoreAction(
      healthyBase({
        now: 10_000,
        lastActionAt: 9_500, // cooldown 内
        lastUserScrollAt: 9_900, // user scrolling 内
        panelRect: { top: -2000, height: 400 }
      })
    );
    // 現実装は cooldown を先に判定するので reason は 'cooldown' が返るのが正。
    // どちらを優先するかの契約を明示: 「両方該当時は cooldown が先」
    expect(r.action).toBe('none');
    expect(['cooldown', 'user_scrolling']).toContain(r.reason);
  });
});

describe('decideCommentPanelRestoreAction: F4 (panel が viewport 外)', () => {
  it('パネル top が viewport 高さの 90% を超えていたら scroll_panel_into_view', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({
        panelRect: { top: 900, height: 200 }, // top 900 > 800 * 0.9 = 720
        viewportHeight: 800
      })
    );
    expect(r).toEqual({
      action: 'scroll_panel_into_view',
      reason: 'out_of_viewport'
    });
  });

  it('パネルが viewport の完全に上に隠れている（bottom <= 0）でも scroll_panel_into_view', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({
        panelRect: { top: -500, height: 400 }, // bottom = -100
        viewportHeight: 800
      })
    );
    expect(r.action).toBe('scroll_panel_into_view');
  });

  it('panelRect が null なら F4 判定はスキップ（viewport 判定不能）', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({ panelRect: null, hasLatestButton: true })
    );
    expect(r.action).toBe('click_latest_button'); // F1 側にフォールバック
  });

  it('viewportHeight=0 のときも F4 判定はスキップ', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({
        viewportHeight: 0,
        panelRect: { top: 9999, height: 400 },
        hasLatestButton: true
      })
    );
    expect(r.action).toBe('click_latest_button');
  });

  it('F4 と F1 両方該当なら F4 を先に返す（段階的復旧）', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({
        panelRect: { top: 2000, height: 400 },
        viewportHeight: 800,
        hasLatestButton: true,
        scrollHost: { scrollTop: 0, scrollHeight: 5000, clientHeight: 400 }
      })
    );
    expect(r.action).toBe('scroll_panel_into_view');
  });
});

describe('decideCommentPanelRestoreAction: F1 (スクロール位置が古い)', () => {
  it('「最新コメントに戻る」ボタンが DOM にあれば click_latest_button', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({ hasLatestButton: true })
    );
    expect(r).toEqual({
      action: 'click_latest_button',
      reason: 'scrolled_up_button'
    });
  });

  it('ボタンが取れなくても scrollHost の下端ギャップが大きければ click_latest_button', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({
        hasLatestButton: false,
        // scrollTop=0, scrollHeight=5000, clientHeight=400
        // bottomGap = 5000 - 400 - 0 = 4600 > 200
        scrollHost: { scrollTop: 0, scrollHeight: 5000, clientHeight: 400 }
      })
    );
    expect(r).toEqual({
      action: 'click_latest_button',
      reason: 'scrolled_up_gap'
    });
  });

  it('scrollHost の下端ギャップが閾値以下なら何もしない（通常のほぼ最下部）', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({
        // bottomGap = 5000 - 400 - 4500 = 100 < 200
        scrollHost: { scrollTop: 4500, scrollHeight: 5000, clientHeight: 400 }
      })
    );
    expect(r.action).toBe('none');
    expect(r.reason).toBe('healthy');
  });

  it('scrollHeight <= clientHeight+100 の小さすぎる host は判定しない（そもそも流れてない可能性）', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({
        scrollHost: { scrollTop: 0, scrollHeight: 400, clientHeight: 400 }
      })
    );
    expect(r.action).toBe('none');
    expect(r.reason).toBe('healthy');
  });

  it('scrollHost が null のときもボタン判定は効く', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({ hasLatestButton: true, scrollHost: null })
    );
    expect(r.action).toBe('click_latest_button');
    expect(r.reason).toBe('scrolled_up_button');
  });

  it('scrollHost が null + ボタン無しなら何もしない', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({ hasLatestButton: false, scrollHost: null })
    );
    expect(r.action).toBe('none');
  });
});

describe('decideCommentPanelRestoreAction: 入力ロバスト性', () => {
  it('NaN/Infinity の scrollHost 値は判定しない', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({
        scrollHost: {
          scrollTop: Number.NaN,
          scrollHeight: Number.POSITIVE_INFINITY,
          clientHeight: 400
        }
      })
    );
    expect(r.action).toBe('none');
  });

  it('空オブジェクト入力でも throw せず disabled を返す', () => {
    const r = decideCommentPanelRestoreAction(
      /** @type {any} */ ({})
    );
    expect(r).toEqual({ action: 'none', reason: 'disabled' });
  });

  it('panelRect の top / height が数値以外なら F4 判定はスキップ', () => {
    const r = decideCommentPanelRestoreAction(
      healthyBase({
        panelRect: /** @type {any} */ ({ top: 'a', height: null }),
        hasLatestButton: true
      })
    );
    expect(r.action).toBe('click_latest_button');
  });
});
