import { it, expect, vi } from 'vitest';
import { VoicePlayer } from './voicePlayer.js';

it('Native24枠でも共有CPUが直列なら増枠を戻し、未完了処理を積み上げない',async()=>{
 vi.useFakeTimers();vi.setSystemTime(1800000000000);
 let tail=Promise.resolve(),accepted=0,peak=0;const starts=[];
 const p=new VoicePlayer({storage:null,isObsMode:()=>false,unlockAudioConstructor:null,
  audioConstructor:function(){const handlers=new Map();return{duration:.75,currentTime:0,play(){setTimeout(()=>handlers.get('playing')?.(),0);setTimeout(()=>handlers.get('ended')?.(),750);return Promise.resolve();},pause(){},addEventListener(k,f){handlers.set(k,f);},removeEventListener(k){handlers.delete(k);}};},
  createObjectURL:()=> 'blob:serial',revokeObjectURL:()=>{},fetchVoicevoxAlive:async()=>true,fetchVoiceStyleIds:async()=>[3],resolveVoice:()=>({styleId:3,speedOffset:0}),
  fetchSynthesizeVoice:async(_text,_voice,o)=>{o.onCapacity(24);accepted++;peak=Math.max(peak,accepted);const done=tail.then(()=>new Promise(r=>setTimeout(r,6000)));tail=done;await done;accepted--;return wav();}
 });
 try{
  await p.enable({persist:false});
  for(let i=0;i<200;i++){
   p.enqueue([{kind:'comment',userId:'u'+i%20,liveId:'lv-cpu',text:'共有CPUテスト'+i,onAudible:()=>starts.push(Date.now())}]);
   await vi.advanceTimersByTimeAsync(600);expect(p.queue.length).toBeLessThanOrEqual(32);
  }
  expect(peak).toBeLessThanOrEqual(2);expect(p._pipeline.limit).toBeLessThanOrEqual(2);
  expect(starts.length).toBeGreaterThanOrEqual(12);
 }finally{p.disable({persist:false});vi.clearAllTimers();vi.useRealTimers();}
});
function wav() {
 const b=new ArrayBuffer(4844),v=new DataView(b);const str=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
 str(0,'RIFF');v.setUint32(4,b.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,24000,true);v.setUint32(28,48000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,4800,true);return b;
}
it('遅い合成でも指定声を続け、完成声が18秒ない間だけPC音声を使う', async()=>{
 vi.useFakeTimers();vi.setSystemTime(1800000000000);
 let active=0,maxActive=0,pc=0;const starts=[],fallbacks=[];
 const p=new VoicePlayer({storage:null,isObsMode:()=>false,unlockAudioConstructor:null,
  audioConstructor:function(){const handlers=new Map();return {duration:0.75,currentTime:0,play(){setTimeout(()=>handlers.get('playing')?.(),0);setTimeout(()=>handlers.get('ended')?.(),750);return Promise.resolve();},pause(){},addEventListener(k,f){handlers.set(k,f);},removeEventListener(k){handlers.delete(k);}};},
  createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{},fetchVoicevoxAlive:async()=>true,fetchVoiceStyleIds:async()=>[3],resolveVoice:()=>({styleId:3,speedOffset:0}),
  lightSpeaker:{available:()=>true,voices:()=>[{}],cancel(){},async speak(_t,_tone,o){pc++;fallbacks.push({at:Date.now()-1800000000000,since:Date.now()-p._lastAudibleAt,active:p._synthInFlight,queue:p.queue.map(q=>({text:q.body,importance:q.importance,age:Date.now()-q.enqueuedAt,pf:p.prefetches.has(q),ready:p.prefetches.get(q)?.ready,settled:p.prefetches.get(q)?.settled}))});o.onStart();await new Promise(r=>setTimeout(r,1000));return true;}},
  fetchSynthesizeVoice:async(text)=>{const i=Number(text.match(/テスト(\d+)/)?.[1]||0);active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,6000+i%6*1000+i%7*1000));active--;return wav();}
 });
 try{
  await p.enable({persist:false});
  for(let i=0;i<200;i++){
   p.enqueue([{kind:'comment',userId:'user'+i%20,liveId:'lv-sim',text:'比較テスト'+i+'です',onAudible:()=>starts.push({i,at:Date.now()})}]);
   await vi.advanceTimersByTimeAsync(600);
  }
  console.log(JSON.stringify({starts:starts.length,pc,fallbacks,maxActive,limit:p._pipeline.limit,recoveries:p.diag.silenceRecoveryTotal,vox:p.diag.spokenTotal-(p.diag.lightSpokenTotal||0)}));
  expect(maxActive).toBeLessThanOrEqual(6);
  expect(p.diag.spokenTotal-(p.diag.lightSpokenTotal||0)).toBeGreaterThan(20);
  // 重要な件の先読みを守ると、初期学習中に18秒間完成声がない窓も生じる。
  // その時だけPC音声を使うのが仕様。完成した指定声があるのに切り替えない。
  expect(fallbacks.every(f=>f.since>=18000 && f.queue.every(q=>!q.ready))).toBe(true);
  expect(p.diag.silenceRecoveryTotal).toBe(0);
 }finally{p.disable({persist:false});vi.clearAllTimers();vi.useRealTimers();}
});
