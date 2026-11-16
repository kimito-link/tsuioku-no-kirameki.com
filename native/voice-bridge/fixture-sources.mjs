import fs from 'node:fs';import path from 'node:path';import {init,parse} from 'es-module-lexer';
import {createHash} from 'node:crypto';
export async function createVoiceFixture(root,directory){
 await init;fs.mkdirSync(directory,{recursive:true});const original=JSON.parse(fs.readFileSync(path.join(root,'extension/manifest.json'),'utf8'));
 fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({manifest_version:3,name:'Isolated Native voice measurement',version:'1.0.0',key:original.key,permissions:['storage','nativeMessaging'],background:{service_worker:'src/extension/native-voice-sw-entry.js',type:'module'}}));
 fs.writeFileSync(path.join(directory,'native-benchmark.html'),'<!doctype html><meta charset="utf-8"><title>Native voice measurement</title>');
 const sourceHashes={},seen=new Set(),todo=['src/extension/native-voice-sw-entry.js','src/lib/voicePlayer.js','src/lib/voicevoxClient.js'];
 while(todo.length){const rel=todo.pop();if(seen.has(rel))continue;seen.add(rel);const full=path.resolve(root,rel);if(!full.startsWith(path.join(root,'src')+path.sep))throw Error('Fixture source outside src');
  const code=fs.readFileSync(full,'utf8'),target=path.join(directory,rel);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,code.replaceAll('com.kimitolink.voice_bridge','com.kimitolink.voice_bridge_test').replaceAll('50021','50161'));
  sourceHashes[rel]=createHash('sha256').update(code).digest('hex');
  for(const spec of parse(code)[0]){if(!spec.n)continue;if(!spec.n.startsWith('.'))throw Error('Unbundled dependency: '+spec.n);todo.push(path.relative(root,path.resolve(path.dirname(full),spec.n)));}
 }
 const hostManifest=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/voice-native/native-host-test.json'),'utf8'));
 const proof={copiedAt:new Date().toISOString(),sourceHashes,hostSha256:createHash('sha256').update(fs.readFileSync(hostManifest.path)).digest('hex')};
 fs.writeFileSync(path.join(directory,'fixture-proof.json'),JSON.stringify(proof,null,2));
 return {files:seen.size,proof};
}
