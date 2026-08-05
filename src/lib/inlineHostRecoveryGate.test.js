import { describe, it, expect } from 'vitest';
import {
  shouldRenderInlineHostOnPoll,
  shouldHideInlineHostOnMissingPanel,
  formatInlineHostRecoveryLine
} from './inlineHostRecoveryGate.js';

describe('shouldRenderInlineHostOnPoll — 2026-08-04 実機の再現', () => {
  it('★真因の再現: 消えたままなのに描かれなかった状態を「描く」に変える', () => {
    // 実測(hostVisWatch): currentlyHidden:true / maxHiddenFrames:426(約7秒)
    //   liveIdSwitched=false(同一配信) / layoutDirty=false(動画は無変化でObserverが鳴らない)
    //   → v0.1.1250 のゲートでは skip=永久に戻らなかった。
    const r = shouldRenderInlineHostOnPoll({
      liveIdSwitched: false,
      layoutDirty: false,
      hostVisible: false,
      hostKnown: true
    });
    expect(r.render).toBe(true);
    expect(r.reason).toBe('host-hidden');
  });

  it('★点滅の真因: 仕様どおり消えているなら復帰させない(2026-08-05 実測)', () => {
    // 実測: 「消した理由 autoshow_off 17回(100%)」「復帰29回/点検364回」
    //   = 消す側と戻す側が競り合っていた。これが点滅の正体。
    const r = shouldRenderInlineHostOnPoll({
      liveIdSwitched: false, layoutDirty: false,
      hostVisible: false, hostKnown: true,
      intentionallyHidden: true
    });
    expect(r.render).toBe(false);
    expect(r.reason).toBe('intended-hidden');
  });

  it('★意図的な非表示でも、配信切替と geometry 変化は従来どおり描く(復帰経路を殺さない)', () => {
    expect(shouldRenderInlineHostOnPoll({
      liveIdSwitched: true, hostVisible: false, hostKnown: true, intentionallyHidden: true
    }).render).toBe(true);
    expect(shouldRenderInlineHostOnPoll({
      layoutDirty: true, hostVisible: false, hostKnown: true, intentionallyHidden: true
    }).render).toBe(true);
  });

  it('★意図的でない非表示は従来どおり復帰させる(v0.1.1254 の効果を維持)', () => {
    const r = shouldRenderInlineHostOnPoll({
      liveIdSwitched: false, layoutDirty: false,
      hostVisible: false, hostKnown: true,
      intentionallyHidden: false
    });
    expect(r.render).toBe(true);
    expect(r.reason).toBe('host-hidden');
  });

  it('見えているときは描かない(v0.1.1250 の4秒ちらつき対策を維持する)', () => {
    const r = shouldRenderInlineHostOnPoll({
      liveIdSwitched: false, layoutDirty: false, hostVisible: true, hostKnown: true
    });
    expect(r.render).toBe(false);
    expect(r.reason).toBe('skip');
  });

  it('配信切替は従来どおり描く', () => {
    expect(shouldRenderInlineHostOnPoll({ liveIdSwitched: true, hostVisible: true, hostKnown: true }))
      .toMatchObject({ render: true, reason: 'live-switch' });
  });

  it('geometry 変化は従来どおり描く', () => {
    expect(shouldRenderInlineHostOnPoll({ layoutDirty: true, hostVisible: true, hostKnown: true }))
      .toMatchObject({ render: true, reason: 'layout-dirty' });
  });

  it('★可視判定が取れないときは描かない(起動直後に毎4秒の重い再描画をしない)', () => {
    const r = shouldRenderInlineHostOnPoll({
      liveIdSwitched: false, layoutDirty: false, hostVisible: false, hostKnown: false
    });
    expect(r.render).toBe(false);
  });

  it('引数が空でも落ちない(計器の失敗が描画を止めない)', () => {
    expect(shouldRenderInlineHostOnPoll(undefined)).toMatchObject({ render: false });
  });
});

describe('shouldHideInlineHostOnMissingPanel — 消しすぎを止める', () => {
  it('★視聴ページに居るなら消さない(コメント欄の一時消失に巻き込まれない)', () => {
    const r = shouldHideInlineHostOnMissingPanel({
      stillOnWatchUrl: true, missTicks: 5, threshold: 5
    });
    expect(r.hide).toBe(false);
    expect(r.reason).toBe('keep-on-watch');
  });

  it('★何回続いても視聴ページなら消さない(閾値を上げるのではなく条件を変える)', () => {
    expect(shouldHideInlineHostOnMissingPanel({
      stillOnWatchUrl: true, missTicks: 999, threshold: 5
    }).hide).toBe(false);
  });

  it('視聴ページを離れていれば従来どおり消す', () => {
    const r = shouldHideInlineHostOnMissingPanel({
      stillOnWatchUrl: false, missTicks: 5, threshold: 5
    });
    expect(r.hide).toBe(true);
    expect(r.reason).toBe('left-page');
  });

  it('閾値未満では消さない(既存のデバウンスを維持)', () => {
    expect(shouldHideInlineHostOnMissingPanel({
      stillOnWatchUrl: false, missTicks: 4, threshold: 5
    })).toMatchObject({ hide: false, reason: 'below-threshold' });
  });

  it('閾値の既定は5(既存 NON_WATCH_HIDE_TICK_THRESHOLD と一致)', () => {
    expect(shouldHideInlineHostOnMissingPanel({ stillOnWatchUrl: false, missTicks: 5 }).hide).toBe(true);
    expect(shouldHideInlineHostOnMissingPanel({ stillOnWatchUrl: false, missTicks: 4 }).hide).toBe(false);
  });
});

describe('formatInlineHostRecoveryLine — 0の意味を区別する', () => {
  it('★点検0回は「未計測」と言う(異常なしと誤読させない)', () => {
    const line = formatInlineHostRecoveryLine({ checkCount: 0, recoverCount: 0 });
    expect(line).toContain('未計測');
    expect(line).not.toContain('✅');
  });

  it('点検ありで復帰0回なら ✅ かつ点検回数を併記する', () => {
    const line = formatInlineHostRecoveryLine({ checkCount: 40, recoverCount: 0 });
    expect(line).toContain('✅');
    expect(line).toContain('点検40回');
  });

  it('復帰させたら回数を出す(正常な防御であることも明記)', () => {
    const line = formatInlineHostRecoveryLine({ checkCount: 40, recoverCount: 3 });
    expect(line).toContain('3回復帰');
    expect(line).toContain('正常な防御');
  });

  it('消すのを見送った回数も出す', () => {
    const line = formatInlineHostRecoveryLine({ checkCount: 40, recoverCount: 0, keptOnWatchCount: 2 });
    expect(line).toContain('2回 見送りました');
  });

  it('材料が無ければ空文字(速報を壊さない)', () => {
    expect(formatInlineHostRecoveryLine(null)).toBe('');
  });
});
