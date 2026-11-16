import { describe, it, expect, vi } from 'vitest';
import { VoicePlayer } from './voicePlayer.js';
import { StreamedVoice } from './voiceStream.js';

describe('指定声の先読みとPC音声の共存', () => {
  it.each(['broadcaster','first','moderator'])('完成した%sを新しい通常コメントに追い越させず、giftはさらに先に選ぶ',importance=>{
    const p=new VoicePlayer({}),now=Date.now();p._pipeline.limit=4;
    const important={importance,priority:'normal',enqueuedAt:now-5000},fresh={enqueuedAt:now-1000},gift={priority:'high',enqueuedAt:now-2000};
    p.queue=[important,fresh,gift];for(const q of p.queue)p.prefetches.set(q,{ready:q!==gift});
    expect(p._readyVoiceIndex()).toBe(0);p.prefetches.get(gift).ready=true;expect(p._readyVoiceIndex()).toBe(2);
  });
  it.each(['broadcaster','first','moderator'])('未合成の%sにも通常件より先に合成枠を渡す',importance=>{
    const synth=vi.fn(()=>new Promise(()=>{})),p=new VoicePlayer({fetchSynthesizeVoice:synth,resolveVoice:()=>({styleId:3,speedOffset:0})});
    const now=Date.now();p.enabled=true;p._pipeline.limit=1;
    p.queue=[{body:'通常の件',userKey:'normal',enqueuedAt:now-1000},{body:'大事な件',userKey:'important',importance,enqueuedAt:now}];
    p._startPrefetch(p.generation);expect(synth.mock.calls[0][0]).toContain('大事な件');p.stop();
  });
  it('待ちが長い並列合成では完成した新しい通常コメントを選び、大事な件を優先する',()=>{
    const p=new VoicePlayer({}),now=Date.now();p._pipeline.limit=4;
    const old={enqueuedAt:now-19000},fresh={enqueuedAt:now-8000},gift={enqueuedAt:now-12000,priority:'high'};
    p.queue=[old,fresh,gift];for(const q of p.queue)p.prefetches.set(q,{ready:true});
    expect(p._readyVoiceIndex()).toBe(2);p.prefetches.get(gift).ready=false;
    expect(p._readyVoiceIndex()).toBe(1);
    p._pipeline.limit=1;expect(p._readyVoiceIndex()).toBe(0);
    p._pipeline.limit=4;old.enqueuedAt=now-1000;fresh.enqueuedAt=now-100;
    expect(p._readyVoiceIndex()).toBe(0);
  });
  it('streamのヘッダ受信だけでCPU枠を解放せず、本文の実完了を待つ',async()=>{
    const stream=new StreamedVoice(24000),synth=vi.fn(async()=>stream);
    const p=new VoicePlayer({fetchSynthesizeVoice:synth,resolveVoice:()=>({styleId:3})});
    p.enabled=true;
    await p._synthesizeTracked('途中の音声',{styleId:3});
    expect(p._engineJobs.size).toBe(1);
    p.queue=[{body:'次の音声',userKey:'next',enqueuedAt:Date.now()}];p._startPrefetch(p.generation);
    expect(synth).toHaveBeenCalledTimes(1);
    stream.finish();for(let i=0;i<12;i++)await Promise.resolve();
    expect(synth).toHaveBeenCalledTimes(2);p.stop();
  });
  it('Native通信断をCPU混雑と誤診せず、完了不明の依頼を75秒抑制する',async()=>{
    const p=new VoicePlayer({fetchSynthesizeVoice:async(_text,_voice,o)=>{o.onFailure({stage:'synth',nativeCode:'disconnected',uncertain:true,error:new Error('native-disconnected')});return null;}});
    await p._synthesizeTracked('通信が切れた件',{styleId:3});
    expect(p.diag.synthFailReasons.native_disconnected).toBe(1);
    expect(p.diag.synthFailReasons.timeout||0).toBe(0);
    expect(p._pipeline.blockedUntil).toBeGreaterThan(Date.now());p.stop();
  });
  it('完成済みの重要な件、完成済みの通常の件の順で選ぶ。各件の声を取り違えない', () => {
    const p=new VoicePlayer({});
    const pending={userKey:'pending'},normal={userKey:'normal'},gift={userKey:'gift',priority:'high'};
    p.queue=[pending,normal,gift];
    p.prefetches.set(pending,{ready:false});p.prefetches.set(normal,{ready:true});p.prefetches.set(gift,{ready:true});
    expect(p._readyVoiceIndex()).toBe(2);
    p.queue.splice(2,1);expect(p._readyVoiceIndex()).toBe(1);
  });
  it('PC音声のモードでも実コメントを1件作り、前の合成の完了前に枠を使い回さない', () => {
    const synth=vi.fn(()=>new Promise(()=>{}));
    const p=new VoicePlayer({fetchSynthesizeVoice:synth,resolveVoice:()=>({styleId:3})});
    p.enabled=true;p._overload.overloaded=true;
    p.queue=[{body:'実コメント',userKey:'a',enqueuedAt:Date.now()}];
    p._startPrefetch(p.generation);
    expect(synth).toHaveBeenCalledTimes(1);expect(synth.mock.calls[0][0]).toContain('実コメント');
    const old=p.queue[0];old.onDropped=()=>{};p.dropQueuedAny(old.onDropped);
    p.queue=[{body:'次',userKey:'b',enqueuedAt:Date.now()}];p._startPrefetch(p.generation);
    expect(synth).toHaveBeenCalledTimes(1);expect(p._synthInFlight).toBe(1);
    p.stop();
  });
  it('停止後は旧世代を鳴らさず、ローカル中断直後の合成再投入も抑制する', async () => {
    let complete;const synth=vi.fn(()=>new Promise(r=>{complete=r;}));
    const p=new VoicePlayer({fetchSynthesizeVoice:synth,resolveVoice:()=>({styleId:3})});
    p.enabled=true;p.queue=[{body:'前',userKey:'a',enqueuedAt:Date.now()}];p._startPrefetch(p.generation);
    p.stop();complete(new ArrayBuffer(16));await Promise.resolve();await Promise.resolve();
    p.queue=[{body:'後',userKey:'b',enqueuedAt:Date.now()}];p._startPrefetch(p.generation);
    expect(synth).toHaveBeenCalledTimes(2);expect(p._pipeline.blockedUntil).toBe(0);
    expect(p._readyVoiceIndex()).toBe(-1);p.stop();
  });
  it('1件のHTTP400で全体を75秒止めない', async () => {
    const p=new VoicePlayer({fetchSynthesizeVoice:async(_t,_v,o)=>{o.onFailure({stage:'query',httpStatus:400});return null;}});
    await p._synthesizeTracked('不正な1件',{styleId:3});
    expect(p._pipeline.blockedUntil).toBe(0);
  });
  it('完了不明の中断は、新着のたびに合成を重ねず待機する', async () => {
    const synth=vi.fn(()=>new Promise(()=>{}));
    const p=new VoicePlayer({fetchSynthesizeVoice:synth,resolveVoice:()=>({styleId:3})});
    p.enabled=true;p.queue=[{body:'前',userKey:'a',enqueuedAt:Date.now()}];p._startPrefetch(p.generation);
    p.stop();await Promise.resolve();
    p.queue=[{body:'後',userKey:'b',enqueuedAt:Date.now()}];p._startPrefetch(p.generation);
    expect(synth).toHaveBeenCalledTimes(1);expect(p._pipeline.blockedUntil).toBeGreaterThan(Date.now());p.stop();
  });
});

it('取消したキャッシュ済み音声を先読みMapへ残さない', () => {
 const p=new VoicePlayer({});
 for(let i=0;i<40;i++){
  const item={onDropped:()=>{}};p.queue.push(item);p.prefetches.set(item,{cached:true,ready:true,settled:true});
  expect(p.dropQueuedAny(item.onDropped)).toBe('dropped');
 }
 expect(p.prefetches.size).toBe(0);
});

it('過負荷中でも完成したキャッシュ80件で待機上限を超えない', () => {
 const p=new VoicePlayer({});p._overload.overloaded=true;
 const items=Array.from({length:80},(_,i)=>({body:String(i),userKey:String(i)}));
 for(const item of items)p.prefetches.set(item,{cached:true,ready:true,settled:true});
 const keeper=p._inflightKeeper();expect(items.filter(keeper)).toHaveLength(0);
 const pending={};p.prefetches.set(pending,{settled:false,cached:false});expect(keeper(pending)).toBe(true);
});

it('watchdogが繰り返しても完了不明依頼の再試行期限を後ろへ動かさない', () => {
 vi.useFakeTimers();vi.setSystemTime(1000);
 try {
  const p=new VoicePlayer({fetchSynthesizeVoice:()=>new Promise(()=>{}),resolveVoice:()=>({styleId:3})});
  p.enabled=true;p.queue=[{body:'前',userKey:'a',enqueuedAt:Date.now()}];p._startPrefetch(p.generation);p.stop();
  const until=p._pipeline.blockedUntil;
  vi.advanceTimersByTime(18000);p.stop();expect(p._pipeline.blockedUntil).toBe(until);
  vi.advanceTimersByTime(18000);p.stop();expect(p._pipeline.blockedUntil).toBe(until);
  vi.advanceTimersByTime(40000);p._refreshEngineBlock();expect(p._pipeline.blockedUntil).toBe(0);
 }finally{vi.useRealTimers();}
});

it('キャッシュhit80件の実enqueueで待機と先読み参照を有界に保つ', () => {
 const clipCache={has:()=>true,get:()=>({wav:new ArrayBuffer(16),boost:0}),put:()=>false};
 const p=new VoicePlayer({clipCache,resolveVoice:()=>({styleId:3})});
 p.enabled=true;p.playing=true;p._overload.overloaded=true;p._pipeline.limit=6;
 p.enqueue(Array.from({length:80},(_,i)=>({kind:'comment',userId:'u'+i,liveId:'lv-cache',text:'短文'+i})));
 expect(p.queue.length).toBeLessThanOrEqual(12);expect(p.prefetches.size).toBeLessThanOrEqual(12);
 for(const q of [...p.queue])p.dropQueuedAny(q.onDropped);
 p.stop();expect(p.prefetches.size).toBe(0);
});
