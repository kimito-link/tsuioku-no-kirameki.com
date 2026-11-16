/* global process, Buffer, setTimeout, clearTimeout, URL, console */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const  exe=path.resolve(process.argv[2]||'build/voice-bridge/VoiceBridge-test.exe');
const output=path.resolve('.artifacts/voice-native');fs.mkdirSync(output,{recursive:true});
const origin='chrome-extension://ohifblceplfkfajfecaoaclmkiahfflm/';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let active=0,maxActive=0,releaseGate;
const gate=new Promise(r=>{releaseGate=r;}),calls=[],responses=new Set();
function wav(text){const tag=Buffer.from('VCBENCH:'+text+';'),n=2400,b=Buffer.alloc(44+n*2+8+tag.length+tag.length%2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);b.write('JUNK',44+n*2);b.writeUInt32LE(tag.length+tag.length%2,48+n*2);tag.copy(b,52+n*2);return b;}
const server=http.createServer(async(req,res)=>{
 responses.add(res);res.once('close',()=>responses.delete(res));
 const u=new URL(req.url,'http://127.0.0.1:50161');let body={};const chunks=[];for await(const b of req)chunks.push(b);try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{/* Test request has no valid JSON body. */}
 const text=u.searchParams.get('text')||body.kana||'';calls.push({route:u.pathname,text,speaker:u.searchParams.get('speaker'),body});
 active++;maxActive=Math.max(maxActive,active);
 if(text==='hang'||text.startsWith('hang-'))return;
 if(text.startsWith('queue-'))await gate;
 await delay(50);active--;
 if(text==='http-failure'){res.writeHead(500);res.end('{}');return;}
 if(u.pathname==='/audio_query'){
  res.setHeader('content-type','application/json');res.end(text==='bad-json'?'{broken':JSON.stringify({accent_phrases:[],kana:text,speedScale:1,pitchScale:0,volumeScale:1,intonationScale:1,outputSamplingRate:24000,outputStereo:false}));return;
 }
 if(u.pathname==='/synthesis'){
  res.setHeader('content-type','audio/wav');res.end(text==='bad-audio'?Buffer.from('not-wav'):text==='oversized'?Buffer.alloc(2097153):wav(text));return;
 }
 res.writeHead(404);res.end();
});
await new Promise((r,j)=>{server.once('error',j);server.listen(50161,'127.0.0.1',r);});
class Host {
 constructor(arg=origin){
  this.frames=[];this.waiters=new Set();this.buffer=Buffer.alloc(0);this.stderr='';this.exited=false;
  this.child=spawn(exe,[arg],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  this.exit=new Promise((resolve,reject)=>{this.child.once('error',reject);this.child.once('exit',code=>{this.exited=true;resolve(code);});});
  this.child.stdout.on('data',data=>{this.buffer=Buffer.concat([this.buffer,data]);while(this.buffer.length>=4){const length=this.buffer.readUInt32LE(0);assert.ok(length<=262144);if(this.buffer.length<length+4)break;const frame=JSON.parse(this.buffer.subarray(4,4+length).toString('utf8'));this.buffer=this.buffer.subarray(4+length);this.frames.push(frame);for(const wake of this.waiters)wake();}});
  this.child.stderr.on('data',data=>{this.stderr+=data.toString();});
  this.child.stdin.on('error',()=>{});
 }
 send(value){const b=Buffer.from(JSON.stringify(value)),h=Buffer.alloc(4);h.writeUInt32LE(b.length);this.child.stdin.write(Buffer.concat([h,b]));}
 waitFor(predicate,ms=25000){const found=this.frames.find(predicate);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const wake=()=>{const frame=this.frames.find(predicate);if(frame){clearTimeout(timer);this.waiters.delete(wake);resolve(frame);}};const timer=setTimeout(()=>{this.waiters.delete(wake);reject(Error('Native response timeout: '+this.stderr));},ms);this.waiters.add(wake);});}
 async synth(id,text,extra={}){this.send({v:1,op:'synthesize',id,text,speaker:3,sampleRate:24000,speedOffset:.25,pitchOffset:.05,...extra});const end=await this.waitFor(f=>f.id===id&&(f.type==='end'||f.type==='error'));const data=Buffer.concat(this.frames.filter(f=>f.id===id&&f.type==='chunk').map(f=>Buffer.from(f.data,'base64')));return{end,data};}
 async close(){this.child.stdin.end();return await this.exit;}
}
const hosts=[],checks=[];
try{
 const invalid=new Host('chrome-extension://unlisted/');hosts.push(invalid);assert.equal(await invalid.exit,3);assert.equal(invalid.frames.length,0);checks.push('unlisted-origin-rejected');
 const host=new Host();hosts.push(host);const hello=await host.waitFor(f=>f.type==='hello');assert.equal(hello.enginePort,50161);assert.equal(hello.maxInflight,24);
 const batch=await Promise.all(Array.from({length:24},(_,i)=>host.synth('parallel-'+i,'比較テスト'+i+'です')));
 for(let i=0;i<batch.length;i++){assert.equal(batch[i].end.type,'end');assert.ok(batch[i].data.includes(Buffer.from('VCBENCH:比較テスト'+i+'です;')));assert.equal(batch[i].end.bytes,batch[i].data.length);}
 assert.ok(maxActive>6,'Native transport must demonstrate more than 6 active requests');assert.ok(maxActive<=24);checks.push('24-correctly-associated-audio-results','more-than-6-native-requests','hard-limit-24');
 const synthBody=calls.find(c=>c.route==='/synthesis').body;assert.equal(synthBody.outputSamplingRate,24000);assert.equal(synthBody.speedScale,1.25);assert.equal(synthBody.pitchScale,.05);checks.push('speaker-rate-pitch-preserved');
 const before=calls.length;
 assert.equal((await host.synth('fractional','bad',{speaker:3.5})).end.status,400);
 assert.equal((await host.synth('long','x'.repeat(513))).end.status,400);
 host.send({v:2,id:'version',op:'synthesize',text:'bad'});assert.equal((await host.waitFor(f=>f.id==='version')).status,400);
 host.send({v:1,id:'operation',op:'fetch',url:'https://example.com/'});assert.equal((await host.waitFor(f=>f.id==='operation')).status,400);
 assert.equal(calls.length,before);checks.push('invalid-input-never-reaches-engine');
 for(const [id,text,code] of [['audio','bad-audio','audio-shape'],['json','bad-json','query-shape'],['http','http-failure','query-http']]){const r=await host.synth(id,text);assert.equal(r.end.code,code);assert.equal(r.end.complete,true);}
 assert.equal((await host.synth('healthy','healthy-after-errors')).end.type,'end');checks.push('per-comment-failure-isolated');
 const queue=Array.from({length:35},(_,i)=>host.synth('queue-'+i,'queue-'+i));
 await host.waitFor(f=>f.code==='queue-full');host.send({v:1,id:'queue-31',op:'cancel'});await delay(20);releaseGate();
 const queued=await Promise.all(queue);assert.ok(queued.some(r=>r.end.code==='queue-full'));assert.equal(queued[31].end.code,'cancelled');assert.ok(!calls.some(c=>c.text==='queue-31'));checks.push('pending-limit-32','queued-cancel-avoids-engine-work');
 const oversized=await host.synth('large','oversized');assert.equal(oversized.end.type,'error');assert.equal(oversized.data.length,0);checks.push('oversized-response-rejected');
 const hangHost=new Host();hosts.push(hangHost);await hangHost.waitFor(f=>f.type==='hello');
 const beforeHang=calls.length;
 const hung=await Promise.all(Array.from({length:32},(_,i)=>hangHost.synth('hang-'+i,'hang-'+i)));
 assert.equal(hung.filter(r=>r.end.code==='timeout'&&r.end.complete===false).length,24);
 assert.equal(hung.filter(r=>r.end.code==='engine-busy'&&r.end.status===429&&r.end.complete===true).length,8);
 assert.equal(calls.length-beforeHang,24);
 const beforeBlocked=calls.length;assert.equal((await hangHost.synth('after-timeout','still-blocked')).end.code,'engine-busy');assert.equal(calls.length,beforeBlocked);
 checks.push('hung-query-times-out-with-uncertain-completion','accepted-queued-work-does-not-reuse-uncertain-cpu-slots','host-blocks-new-work-after-uncertain-completion');
 assert.equal(await host.close(),0);checks.push('clean-exit-after-pipe-close');
 assert.equal(await hangHost.close(),0);
 const badFrame=new Host();hosts.push(badFrame);await badFrame.waitFor(f=>f.type==='hello');const h=Buffer.alloc(4);h.writeUInt32LE(65537);badFrame.child.stdin.write(h);assert.equal(await badFrame.exit,2);checks.push('oversized-input-frame-rejected-before-allocation');
 const result={ok:true,checks,maxActive,enginePort:50161,hostSha256:createHash('sha256').update(fs.readFileSync(exe)).digest('hex'),sourceSha256:createHash('sha256').update(fs.readFileSync('native/voice-bridge/VoiceBridge.cs')).digest('hex'),engineRequests:calls.length};
 fs.writeFileSync(path.join(output,'host-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
 releaseGate();for(const host of hosts)if(!host.exited)host.child.kill();for(const res of responses)res.destroy();server.close();
}
