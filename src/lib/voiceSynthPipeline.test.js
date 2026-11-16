import { describe, it, expect } from 'vitest';
import { createVoicePipelineState, setVoicePipelineCapacity, noteVoicePipelineStart, noteVoicePipelineResult, voicePipelinePendingLimit } from './voiceSynthPipeline.js';

describe('合成先読みの能力適応', () => {
  it('Native24枠でも待機32件以内に保ち、HTTPへ戻ったら6枠へ縮める',()=>{
    const s=createVoicePipelineState();setVoicePipelineCapacity(s,24);s.limit=24;
    expect(voicePipelinePendingLimit(s)).toBe(32);
    setVoicePipelineCapacity(s,6);expect(s.limit).toBe(6);expect(voicePipelinePendingLimit(s)).toBe(12);
    setVoicePipelineCapacity(s,999);expect(s.maxInflight).toBe(6);
  });
  const sample = (s, limit, start, end, totalMs = end-start) => noteVoicePipelineResult(s, { ok: true, limit, nowMs: end, totalMs, arrivalPerMin: 100 });
  it('最初は1件で観測し、需要と完了実績がある時だけ増やす', () => {
    const s = createVoicePipelineState();
    expect(noteVoicePipelineStart(s, 1000)).toBe(1);
    sample(s, 1, 1000, 7000);
    expect(s.limit).toBe(2);
    noteVoicePipelineStart(s, 7000);
    sample(s, 2, 7000, 15000);
    expect(s.limit).toBe(2);
    sample(s, 2, 7000, 17000);
    expect(s.limit).toBe(4);
  });
  it('CPU内で直列化され完了速度が悪化すると減らし、すぐ増やし直さない', () => {
    const s = createVoicePipelineState();
    noteVoicePipelineStart(s, 1000);sample(s, 1, 1000, 7000);
    noteVoicePipelineStart(s, 7000);sample(s, 2, 7000, 19000);sample(s, 2, 7000, 31000);
    expect(s.limit).toBe(1);
    noteVoicePipelineStart(s, 31000);sample(s, 1, 31000, 37000);
    expect(s.limit).toBe(1);
  });
  it('静かな配信では合成が成功しても増やさない', () => {
    const s=createVoicePipelineState();noteVoicePipelineStart(s,1000);
    noteVoicePipelineResult(s,{ok:true,limit:1,totalMs:100,nowMs:1100,arrivalPerMin:10});
    expect(s.limit).toBe(1);
  });
  it('永久pendingを成功と数えず、中断した旧世代の結果も混ぜない', () => {
    const s=createVoicePipelineState();noteVoicePipelineStart(s,1000);
    expect(s.limit).toBe(1);
    noteVoicePipelineResult(s,{ok:true,aborted:true,limit:1,totalMs:10000,nowMs:11000,arrivalPerMin:100});
    expect(s.limit).toBe(1);expect(s.completed).toBe(0);
  });
  it('失敗時は抑制し、同時処理と待機の上限を超えない', () => {
    const s=createVoicePipelineState();s.limit=s.maxInflight;
    expect(voicePipelinePendingLimit(s)).toBe(12);
    noteVoicePipelineResult(s,{ok:false,uncertain:true,limit:s.limit,nowMs:10000});
    expect(s.limit).toBe(3);expect(s.cooldownUntil).toBe(70000);
  });
});
