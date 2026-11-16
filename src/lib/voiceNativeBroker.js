/**
 * 【層】L2 実行層
 * 【この箱に入るもの】補助アプリの接続・有界な要求と応答の対応
 * 【この箱に入らないもの】DOM / storageの直接操作 / 任意URLへの接続
 * 【書けるstorageキー】なし
 * 【正本宣言】Native Messagingの要求管理はここに集約する
 */
import { VOICE_NATIVE_MAX_AUDIO, VOICE_NATIVE_MAX_INFLIGHT, VOICE_NATIVE_MAX_PENDING, validNativeRequest, validNativeId, nativeBase64Size } from './voiceNativeProtocol.js';
/** @typedef {{available:boolean,v?:number,maxInflight?:number,maxPending?:number,busy?:boolean}} NativeCapabilities */
/** @typedef {{available:boolean,notStarted?:boolean,audioBase64?:string,bytes?:number,queryMs?:number,synthMs?:number,error?:{code:string,complete:boolean,status:number,phase:string}}} NativeResult */
/** @typedef {{resolve:(result:NativeResult)=>void,owner:string,chunks:string[],bytes:number,expected:number,padding:boolean,queryMs:number,synthMs:number,timer:ReturnType<typeof setTimeout>|null}} NativeJob */
/** @param {{connect:()=>any,now?:()=>number,requestTimeoutMs?:number,idleMs?:number,getLastError?:()=>any}} options */
export function createVoiceNativeBroker({ connect, now=Date.now, requestTimeoutMs=60000, idleMs=30000, getLastError=()=>null }) {
 /** @type {any} */ let port=null;
 /** @type {NativeCapabilities|null} */ let ready=null;
 /** @type {Promise<NativeCapabilities|null>|null} */ let connecting=null;
 /** @type {((value:NativeCapabilities|null)=>void)|null} */ let resolveHello=null;
 /** @type {ReturnType<typeof setTimeout>|null} */ let helloTimer=null;
 /** @type {ReturnType<typeof setTimeout>|null} */ let idleTimer=null;
 let retryAt=0,uncertainUntil=0,closing=false;
 /** @type {Map<string,NativeJob>} */ const pending=new Map();
 /** @type {Map<string,number>} */ const cancelled=new Map();
 /** @param {string} code @returns {NativeResult} */
 const failure=(code,complete=false,status=0,phase='synth')=>({available:true,error:{code,complete,status,phase}});
 /** @param {string} id @param {NativeResult} result */
 function settle(id,result){if(result?.error && result.error.complete!==true)uncertainUntil=Math.max(uncertainUntil,now()+75000);const job=pending.get(id);if(!job)return;clearTimeout(job.timer);pending.delete(id);job.resolve(result);if(!pending.size){if(closing)disconnect(false);else armIdle();}}
 function disconnect(failed=true){
  if(failed && pending.size)uncertainUntil=Math.max(uncertainUntil,now()+75000);
  const old=port;port=null;ready=null;connecting=null;clearTimeout(helloTimer);clearTimeout(idleTimer);
  if(failed)retryAt=now()+30000;
  const hello=resolveHello;resolveHello=null;hello?.(null);
  for(const id of [...pending.keys()])settle(id,failure('disconnected'));
  closing=false;try{old?.disconnect();}catch{/* already disconnected */}
 }
 function armIdle(){clearTimeout(idleTimer);if(!port)return;idleTimer=setTimeout(()=>{if(!pending.size)disconnect(false);},idleMs);}
 /** @param {any} message */
 function onMessage(message){
  if(!message || typeof message !== 'object' || message.v!==1){disconnect(true);return;}
  if(message.type==='hello'){
   if(ready || !Number.isInteger(message.maxInflight) || message.maxInflight<1 || message.maxInflight>VOICE_NATIVE_MAX_INFLIGHT || message.maxAudioBytes!==VOICE_NATIVE_MAX_AUDIO || !Number.isInteger(message.maxPending) || message.maxPending<message.maxInflight || message.maxPending>VOICE_NATIVE_MAX_PENDING){disconnect(true);return;}
   ready={available:true,v:1,maxInflight:message.maxInflight,maxPending:Math.min(VOICE_NATIVE_MAX_PENDING,Number(message.maxPending)||0)};
   clearTimeout(helloTimer);const hello=resolveHello;resolveHello=null;hello?.(ready);armIdle();return;
  }
  if(!validNativeId(message.id))return;
  const job=pending.get(message.id);if(!job)return; // 期限切れの古いIDを別の要求へ混ぜない
  if(message.type==='error'){
   const code=typeof message.code==='string' && /^[a-z-]{1,40}$/.test(message.code)?message.code:'native-failure';
   const status=Number.isInteger(message.status)&&message.status>=0&&message.status<=599?message.status:0;
   settle(message.id,failure(code,message.complete===true,status,message.phase==='query'?'query':'synth'));return;
  }
  if(message.type==='audio'){
   if(job.expected || !Number.isInteger(message.bytes)||message.bytes<44||message.bytes>VOICE_NATIVE_MAX_AUDIO){settle(message.id,failure('invalid-audio'));return;}
   job.expected=message.bytes;job.queryMs=Number(message.queryMs);job.synthMs=Number(message.synthMs);return;
  }
  if(message.type==='chunk'){
   const bytes=nativeBase64Size(message.data);
   if(!job.expected || bytes<=0 || job.padding || job.bytes+bytes>job.expected){settle(message.id,failure('invalid-chunk'));return;}
   job.bytes+=bytes;job.padding=message.data.endsWith('=');job.chunks.push(message.data);return;
  }
  if(message.type==='end'){
   if(message.complete!==true || !job.expected || job.bytes!==job.expected || message.bytes!==job.bytes){settle(message.id,failure('incomplete-audio'));return;}
   settle(message.id,{available:true,audioBase64:job.chunks.join(''),bytes:job.bytes,queryMs:Number.isFinite(job.queryMs)?job.queryMs:0,synthMs:Number.isFinite(job.synthMs)?job.synthMs:0});return;
  }
  settle(message.id,failure('unknown-frame'));
 }
 /** @returns {Promise<NativeCapabilities>} */
 async function capabilities(){
  if(now()<uncertainUntil)return {available:false,busy:true};
  if(closing)return {available:false,busy:pending.size>0};
  if(now()<retryAt)return {available:false};
  if(ready)return ready;
  if(connecting)return await connecting;
  connecting=new Promise(resolve=>{resolveHello=resolve;});
  const wait=connecting;
  try{
   const connected=connect();port=connected;
   connected.onMessage.addListener((/** @type {any} */ message)=>{if(port===connected)onMessage(message);});
   connected.onDisconnect.addListener(()=>{try{getLastError();}catch{/* API context ended */}if(port===connected)disconnect(true);});
   helloTimer=setTimeout(()=>disconnect(true),5000);
  }catch{disconnect(true);}
  return await wait || {available:false};
 }
 /** @param {any} request @param {string} [owner] @returns {Promise<NativeResult>} */
 async function synthesize(request,owner=''){
  if(!validNativeRequest(request))return failure('invalid-request',true,400,'query');
  const cancelKey=owner+':'+request.id;
  const until=cancelled.get(cancelKey);cancelled.delete(cancelKey);
  if(until>now())return failure('cancelled',true,499,'query');
  const cap=await capabilities();
  if(cap.busy)return failure('engine-busy',true,429,'query');
  if(!cap.available)return {available:false,notStarted:true};
  const cancelledDuringConnect=cancelled.get(cancelKey);cancelled.delete(cancelKey);
  if(cancelledDuringConnect>now())return failure('cancelled',true,499,'query');
  if(pending.has(request.id))return failure('duplicate-id',false,0);
  if(pending.size>=Math.min(cap.maxPending||VOICE_NATIVE_MAX_PENDING,VOICE_NATIVE_MAX_PENDING))return failure('queue-full',true,429,'query');
  clearTimeout(idleTimer);
  return await new Promise(resolve=>{
   /** @type {NativeJob} */
   const job={resolve,owner,chunks:[],bytes:0,expected:0,padding:false,queryMs:0,synthMs:0,timer:null};
   job.timer=setTimeout(()=>{try{port?.postMessage({v:1,op:'cancel',id:request.id});}catch{/* disconnected */}settle(request.id,failure('timeout'));},requestTimeoutMs);
   pending.set(request.id,job);
   try{port.postMessage({...request,v:1,op:'synthesize'});}catch{settle(request.id,failure('disconnected'));disconnect(true);}
  });
 }
 /** @param {unknown} id @param {string} [owner] */
 function cancel(id,owner=''){
  if(!validNativeId(id))return false;
  const job=pending.get(id);
  if(job && job.owner!==owner)return false;
  if(!job){
   for(const [key,until] of cancelled)if(until<=now())cancelled.delete(key);
   if(cancelled.size>=64)cancelled.delete(cancelled.keys().next().value);
   cancelled.set(owner+':'+id,now()+5000);return true;
  }
  try{port?.postMessage({v:1,op:'cancel',id});}catch{disconnect(true);}return true;
 }
 return { capabilities,synthesize,cancel,releaseWhenIdle(){closing=true;if(!pending.size)disconnect(false);},dispose(){disconnect(false);},pendingCount:()=>pending.size,engineBusy:()=>pending.size>0 || now()<uncertainUntil };
}
