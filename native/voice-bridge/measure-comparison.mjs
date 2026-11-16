/* global process, Buffer, setTimeout, clearTimeout, fetch, AbortSignal, WebSocket, URL, window, chrome, speechSynthesis, Audio, console */
import { createVoiceFixture } from './fixture-sources.mjs';
// 比較用プロファイルのOneComme公式APIと追憶VoicePlayerへ同じコメントを投入する測定器。
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
const root=process.cwd(), dir=path.join(root,'.artifacts/onecomme-comparison');
const runTag=Date.now().toString(36);let expectedProfile=null;
const duration=Number(process.argv[2]||'25')*1000;
const modes=(process.argv[3]||'fast,slow').split(',');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let activeMode='fast', phaseStarted=0;
const engines=[], openResponses=new Set();
async function api(route,body,method=body?'POST':'GET'){
 if(method!=='GET' && expectedProfile){const info=await api('info');if(info.templatePath!==expectedProfile)throw Error('Comparison profile changed; mutation refused');}
 let r;try{r=await fetch('http://127.0.0.1:11180/api/'+route,{method,headers:body?{'content-type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(route.startsWith("comments")?15000:30000)});}catch(error){throw new Error('Comparison API '+method+' '+route+' failed: '+error.message);}
 const text=await r.text();if(!r.ok)throw new Error(route+': '+r.status+' '+text);try{return JSON.parse(text);}catch{return text;}
}
class CDP {
 constructor(ws){this.ws=ws;this.seq=0;this.pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data),p=this.pending.get(m.id);if(p){clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}};}
 static async connect(url){const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});return new CDP(ws);}
 send(method,params={}){return new Promise((resolve,reject)=>{const id=++this.seq,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout '+method));},20000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
 async eval(expression){const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;}
 close(){this.ws.close();}
}
function taggedWav(id,speed=1){const rate=24000,n=Math.round(rate*0.8/Math.max(0.5,Number(speed)||1)),tag=Buffer.from('VCBENCH:'+id+';'),len=tag.length+(tag.length%2),b=Buffer.alloc(44+n*2+8+len);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.round(Math.sin(2*Math.PI*440*i/rate)*1500),44+i*2);b.write('JUNK',44+n*2);b.writeUInt32LE(len,48+n*2);tag.copy(b,52+n*2);return b;}
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1'),chunks=[];for await(const c of req)chunks.push(c);let body={};try{body=JSON.parse(Buffer.concat(chunks));}catch{/* Test request has no valid JSON body. */}
 const app=String(req.headers['user-agent']||'').includes('KimitoLink-VoiceBridge/1')?'ours':'onecomme';const route=u.pathname.replace(/^\/ours/,'');
 const text=u.searchParams.get('text')||body.kana||'',match=text.match(/テスト(\d+)/),i=match?Number(match[1]):-1,id=match?'cmp-'+String(i).padStart(4,'0'):null;
 const record={at:Date.now(),app,mode:activeMode,path:route,method:req.method,id,text,endedAt:null,aborted:false};engines.push(record);openResponses.add(res);res.on('close',()=>{openResponses.delete(res);if(!res.writableEnded)record.aborted=true;});
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','*');
 const json=v=>{res.setHeader('content-type','application/json');record.endedAt=Date.now();res.end(JSON.stringify(v));};
 if(req.method==='OPTIONS'){record.endedAt=Date.now();res.writeHead(204);return res.end();}
 if(route==='/version')return json('0.26.1');
 if(route==='/speakers')return json([{name:'比較用',speaker_uuid:'00000000-0000-0000-0000-000000000001',styles:[{id:3,name:'ノーマル',type:'talk'}],version:'0.26.1'}]);
 if(route==='/audio_query'||route==='/synthesis'){
  if(activeMode==='frozen'&&Date.now()-phaseStarted>=12000)return;
  const slow=activeMode==='slow',delay=route==='/audio_query'?(slow?2000+(Math.max(0,i)%6)*1000:80):(slow?4000+(Math.max(0,i)%7)*1000:100);
  await sleep(delay);if(res.destroyed)return;
  if(route==='/audio_query')return json({accent_phrases:[],speedScale:1,pitchScale:0,intonationScale:1,volumeScale:1,prePhonemeLength:0.1,postPhonemeLength:0.1,outputSamplingRate:24000,outputStereo:false,kana:text});
  record.endedAt=Date.now();res.setHeader('content-type','audio/wav');return res.end(taggedWav(id||'probe',body.speedScale));
 }
 if(route==='/is_initialized_speaker')return json(true);
 json({cpu:true,cuda:false,supported_features:{}});
});
const pages=http.createServer((req,res)=>{const u=new URL(req.url,'http://127.0.0.1');if(u.pathname==='/'){res.setHeader('content-type','text/html');return res.end('<!doctype html><title>voice comparison</title>');}const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep)||!file.endsWith('.js')||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('content-type','text/javascript; charset=utf-8');fs.createReadStream(file).pipe(res);});
await Promise.all([new Promise((r,j)=>{server.once('error',j);server.listen(50161,'127.0.0.1',r);}),new Promise((r,j)=>{pages.once('error',j);pages.listen(50162,'127.0.0.1',r);})]);
let browser,cdp,initial;
const results=[];
try {
 const info=await api('info');if(!info.templatePath.startsWith(path.join(root,'.artifacts','onecomme-comparison')+path.sep))throw new Error('Refusing profile outside this isolated checkout');expectedProfile=info.templatePath;initial=await api('config');
 const targets=await(await fetch('http://127.0.0.1:59322/json/list')).json();const target=targets.find(t=>t.type==='page'&&t.url.endsWith('/index.html'));if(!target)throw new Error('No isolated app audio renderer');cdp=await CDP.connect(target.webSocketDebuggerUrl);
 await cdp.eval(`(()=>{if(window.__vcProbe)return true;const s=window.__vcProbe={events:[]};const old=HTMLMediaElement.prototype.play,seen=new WeakSet();HTMLMediaElement.prototype.play=function(...args){if(!seen.has(this)){seen.add(this);for(const type of ['playing','ended','error'])this.addEventListener(type,()=>{const src=this.currentSrc||this.src;const e={type,at:Date.now(),id:null,scheme:src.split(':')[0]};s.events.push(e);if(type==='playing'&&(src.startsWith('blob:')||src.startsWith('data:')))fetch(src).then(r=>r.arrayBuffer()).then(b=>{e.id=new TextDecoder().decode(b).match(/VCBENCH:([^;]+);/)?.[1]||null;}).catch(()=>{});});}return old.apply(this,args);};if(window.speechSynthesis){const oldSpeak=SpeechSynthesis.prototype.speak;SpeechSynthesis.prototype.speak=function(u){for(const type of ['start','end','error'])u.addEventListener(type,()=>s.events.push({type:'speech-'+type,at:Date.now(),id:'cmp-'+String(Number(u.text.match(/テスト(\\d+)/)?.[1])).padStart(4,'0'),text:u.text}));return oldSpeak.call(this,u);};}return true;})()`);
 const fixture=path.join(root,'.artifacts/voice-native/benchmark-extension-'+Date.now());await createVoiceFixture(root,fixture);
 browser=await chromium.launchPersistentContext(path.join(root,'.artifacts/voice-native/benchmark-profile-'+Date.now()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+fixture,'--load-extension='+fixture,'--autoplay-policy=no-user-gesture-required']});
 const sw=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker',{timeout:15000});const extensionId=new URL(sw.url()).host;if(extensionId!=='ohifblceplfkfajfecaoaclmkiahfflm')throw Error('Unexpected fixture identity');
 for(const mode of modes){
  activeMode=mode;phaseStarted=Date.now();
  await api('speech',null,'DELETE');await api('config',{speech:{speechName:false,speechFormat:'{comment}'},integration:{voicevox:{enabled:false,hostname:'127.0.0.1',port:50161,autoLaunch:false}}});await sleep(1200);
  await api('config',{integration:{voicevox:{enabled:true,hostname:'127.0.0.1',port:50161,autoLaunch:false,options:{speaker:3,speedScale:1},limitQueue:10,autoSpeed:false}}});
  const cfg=await api('config');if(cfg.integration.voicevox.port!==50161||!cfg.integration.voicevox.enabled)throw new Error('Wrong engine');
  const context=browser,page=await context.newPage();await page.goto('chrome-extension://'+extensionId+'/native-benchmark.html');
  await page.evaluate(async tag=>{window.__benchRunTag=tag;await chrome.storage.local.set({nls_voice_native_enabled_v1:true});const cap=await chrome.runtime.sendMessage({type:'nls:voice:native:probe'});if(!cap.available)throw Error('Native bridge unavailable');},runTag);
  await page.evaluate(async()=>{
   const {VoicePlayer}=await import('/src/lib/voicePlayer.js'),{createLightSpeaker}=await import('/src/lib/voiceLightSpeaker.js');const {synthesizeVoice,setVoicevoxOutputSamplingRate}=await import('/src/lib/voicevoxClient.js');setVoicevoxOutputSamplingRate(24000);const nap=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<30&&!speechSynthesis.getVoices().length;i++)await nap(100);
   const events=[];const p=new VoicePlayer({storage:null,isObsMode:()=>false,audioConstructor:Audio,unlockAudioConstructor:null,createObjectURL:b=>URL.createObjectURL(b),revokeObjectURL:u=>URL.revokeObjectURL(u),probeVoicevoxAlive:async()=>({ok:true,reason:''}),fetchVoicevoxAlive:async()=>true,fetchVoiceStyleIds:async()=>[3],resolveVoice:()=>({styleId:3,speedOffset:0,pitchOffset:0}),lightSpeaker:createLightSpeaker(),fetchSynthesizeVoice:(text,voice,o={})=>synthesizeVoice(text,voice,o)});
   await p.enable({persist:false});window.__vcOurs={p,events,enqueue(i){const id='cmp-'+String(i).padStart(4,'0');p.enqueue([{kind:'comment',userId:'user'+i%20,nickname:'比較用',text:'比較テスト'+String(i).padStart(4,'0')+'です-'+window.__benchRunTag,liveId:'lv-comparison',key:id,onAudible:()=>events.push({type:'playing',at:Date.now(),id}),onAudioEnd:()=>events.push({type:'ended',at:Date.now(),id})}]);}};
  });
  await cdp.eval('window.__vcProbe.events=[];true');const start=phaseStarted=Date.now(),sent=[];const count=Math.floor(duration/600);console.log('START '+mode+' '+start+' count='+count);
  for(let i=0;i<count;i++){const wait=start+i*600-Date.now();if(wait>0)await sleep(wait);const at=Date.now();sent.push({id:'cmp-'+String(i).padStart(4,'0'),at});const text='比較テスト'+String(i).padStart(4,'0')+'です-'+runTag;await Promise.all([api('comments',{service:{id:'00000000-0000-4000-8000-000000000001',write:true,speech:true,persist:false},comment:{id:mode+'-'+runTag+'-'+i,userId:'user'+i%20,name:'比較用',badges:[],profileImage:'',comment:text,hasGift:false,isOwner:false,timestamp:at}}),page.evaluate(i=>window.__vcOurs.enqueue(i),i)]);if(i%20===0)fs.writeFileSync(dir+'/progress.json',JSON.stringify({mode,sent:i+1,total:count,elapsedMs:Date.now()-start}));}
  await sleep(Math.max(0,start+duration-Date.now()));const end=Date.now();const oneEvents=await cdp.eval('window.__vcProbe.events'),ours=await page.evaluate(()=>({events:window.__vcOurs.events,diag:JSON.parse(JSON.stringify(window.__vcOurs.p.diag))}));
  const summary=events=>{const starts=events.filter(e=>(e.type==='playing'||e.type==='speech-start')&&e.at>=start&&e.at<=end&&(typeof e.id==='string'&&/^cmp-\d{4}$/.test(e.id)));const points=[start,...starts.map(e=>e.at).sort((a,b)=>a-b),end];let gap=0;for(let i=1;i<points.length;i++)gap=Math.max(gap,points[i]-points[i-1]);const map=new Map(sent.map(x=>[x.id,x.at]));const latencies=starts.filter(x=>map.has(x.id)).map(x=>x.at-map.get(x.id)).sort((a,b)=>a-b);return{starts:starts.length,maxStartGapMs:gap,identifiedStarts:latencies.length,latencyP50Ms:latencies[Math.floor(latencies.length*.5)]??null,latencyP95Ms:latencies[Math.floor(latencies.length*.95)]??null,latencyMaxMs:latencies.at(-1)??null};};
  const result={validComparison:sent.every((x,i)=>x.at-start-i*600<=250)&&summary(oneEvents).starts>0&&summary(ours.events).starts>0,maxInputLatenessMs:Math.max(...sent.map((x,i)=>x.at-start-i*600)),mode,candidate:"native-messaging-working-tree",runTag,actualNativeMessaging:true,onecommeProfile:expectedProfile,uniqueInputText:true,startedAt:new Date(start).toISOString(),durationMs:end-start,inputs:sent.length,engine:{queryDelay:mode==='slow'?'2-7s':'80ms',synthDelay:mode==='slow'?'4-10s':'100ms',wavBaseMs:800},onecomme:summary(oneEvents),ours:{...summary(ours.events),diag:ours.diag},sent,oneEvents,oursEvents:ours.events,engineLog:engines.filter(e=>e.at>=start&&e.at<=end)};results.push(result);fs.writeFileSync(dir+'/paired-'+mode+'-'+start+'.json',JSON.stringify(result,null,2));console.log('DONE '+mode+' '+JSON.stringify({validComparison:result.validComparison,maxInputLatenessMs:result.maxInputLatenessMs,onecomme:result.onecomme,ours:summary(ours.events)}));
  await page.evaluate(()=>window.__vcOurs.p.disable({persist:false}));await context.close();await api('speech',null,'DELETE');await api('config',{integration:{voicevox:{enabled:false}}});await sleep(1500);
 }
}catch(error){fs.writeFileSync(dir+'/failed-native-'+Date.now()+'.json',JSON.stringify({validComparison:false,error:String(error),runTag,mode:activeMode,engineLog:engines},null,2));throw error;}finally{
 if(initial){await api('speech',null,'DELETE').catch(()=>{});await api('config',{speech:{speechName:initial.speech.speechName,speechFormat:initial.speech.speechFormat},integration:{voicevox:{enabled:false,hostname:'127.0.0.1',port:50161,autoLaunch:false,options:initial.integration.voicevox.options,limitQueue:initial.integration.voicevox.limitQueue,autoSpeed:initial.integration.voicevox.autoSpeed}}}).catch(()=>{});}
 await browser?.close();cdp?.close();for(const res of openResponses)res.destroy();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>pages.close(r))]);fs.writeFileSync(dir+'/paired-summary-'+Date.now()+'.json',JSON.stringify({onecommeVersion:'9.0.2',extensionVersion:'adaptive-pipeline-working-tree',results:results.map(r=>({mode:r.mode,durationMs:r.durationMs,inputs:r.inputs,onecomme:r.onecomme,ours:{...r.ours,diag:undefined}}))},null,2));
}
