/* global Buffer, URL, chrome, console */
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
const dir=path.resolve('.artifacts/voice-native'),fixture=path.join(dir,'extension-fixture');fs.mkdirSync(fixture,{recursive:true});
const manifest=JSON.parse(fs.readFileSync('extension/manifest.json','utf8'));
fs.writeFileSync(path.join(fixture,'manifest.json'),JSON.stringify({manifest_version:3,name:'Isolated voice transport verification',version:'1.0.0',key:manifest.key,permissions:['storage','nativeMessaging'],background:{service_worker:'worker.js'}}));
fs.writeFileSync(path.join(fixture,'test.html'),'<!doctype html><meta charset="utf-8"><title>Native voice verification</title><p>Isolated verification</p>');
const bundle=fs.readFileSync('extension/dist/native-voice-sw.js','utf8');
fs.writeFileSync(path.join(fixture,'worker.js'),bundle.replaceAll('com.kimitolink.voice_bridge','com.kimitolink.voice_bridge_test'));
const calls=[];function wav(){const b=Buffer.alloc(4844);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(4800,40);return b;}
const server=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://127.0.0.1:50161');const chunks=[];for await(const c of req)chunks.push(c);let body={};try{body=JSON.parse(Buffer.concat(chunks));}catch{/* Test request has no valid JSON body. */}calls.push({route:u.pathname,speaker:u.searchParams.get('speaker'),sampleRate:body.outputSamplingRate});res.setHeader('content-type','application/json');res.end(u.pathname==='/audio_query'?JSON.stringify({accent_phrases:[],kana:u.searchParams.get('text'),speedScale:1,pitchScale:0}):wav());});
await new Promise((r,j)=>{server.once('error',j);server.listen(50161,'127.0.0.1',r);});
let context;try{
 context=await chromium.launchPersistentContext(path.join(dir,'chromium-native-'+Date.now()),{headless:true,channel:'chromium',args:['--disable-extensions-except='+fixture,'--load-extension='+fixture,'--autoplay-policy=no-user-gesture-required']});
 const workers=context.serviceWorkers();const sw=workers[0]||await context.waitForEvent('serviceworker',{timeout:15000});const id=new URL(sw.url()).host;
 assert.equal(id,'ohifblceplfkfajfecaoaclmkiahfflm');
 const page=await context.newPage();await page.goto('chrome-extension://'+id+'/test.html');
 const result=await page.evaluate(async()=>{
  const off=await chrome.runtime.sendMessage({type:'nls:voice:native:probe'});
  await chrome.storage.local.set({nls_voice_native_enabled_v1:true});
  const cap=await chrome.runtime.sendMessage({type:'nls:voice:native:probe'});
  const response=await chrome.runtime.sendMessage({type:'nls:voice:native:synth',request:{id:'browser-native-1',text:'接続テスト',speaker:3,sampleRate:24000,speedOffset:.25,pitchOffset:.05}});
  return {off,cap,response};
 });
 assert.equal(result.off.available,false);assert.equal(result.cap.available,true);assert.equal(result.cap.maxInflight,24);assert.equal(result.response.available,true);assert.equal(result.response.bytes,4844);assert.ok(Buffer.from(result.response.audioBase64,'base64').subarray(0,4).equals(Buffer.from('RIFF')));
 assert.deepEqual(calls.map(x=>x.route),['/audio_query','/synthesis']);assert.equal(calls[1].sampleRate,24000);
 const proof={ok:true,actualChromeNativeMessaging:true,productionBundle:true,bundleSha256:createHash('sha256').update(bundle).digest('hex'),extensionId:id,enginePort:50161,withoutOptIn:result.off,capabilities:result.cap,wavBytes:result.response.bytes,calls};
 fs.writeFileSync(path.join(dir,'chrome-native-verification.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{await context?.close();await new Promise(r=>server.close(r));}
