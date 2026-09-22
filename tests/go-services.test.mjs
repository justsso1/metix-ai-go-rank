import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { createServer } from 'vite';

test('actual local HTTP proxy carries ranking requests and tracker batches', async () => {
 const received=[];
 const upstream=http.createServer(async(req,res)=>{
  let raw='';for await (const chunk of req) raw+=chunk;
  received.push({path:req.url,body:JSON.parse(raw||'{}')});
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify(req.url==='/peer-rank/rank'?{data:{rank:47,total:1240}}:{code:0}));
 });
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
 const origin=`http://127.0.0.1:${upstream.address().port}`;
 const previous=[process.env.ATLAS_UPSTREAM,process.env.TRACK_UPSTREAM];
 process.env.ATLAS_UPSTREAM=origin;process.env.TRACK_UPSTREAM=origin;
 const tempRoot=await mkdtemp(join(tmpdir(),'rank-proxy-'));
 let proxy;
 try {
  const {default:config}=await import('../astro.config.mjs');
  proxy=await createServer({configFile:false,root:tempRoot,optimizeDeps:{noDiscovery:true,entries:[]},server:{...config.vite.server,host:'127.0.0.1',port:0},logLevel:'silent'});
  await proxy.listen();const endpoint=`http://127.0.0.1:${proxy.httpServer.address().port}`;
  const rank=await fetch(endpoint+'/atlas/peer-rank/rank',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({linkedin:'https://www.linkedin.com/in/test-fixture'})});
  assert.equal(rank.status,200);assert.equal((await rank.json()).data.rank,47);
  const store=()=>({getItem:()=>null,setItem:()=>{}});
  const document={readyState:'complete',cookie:'',referrer:'',title:'Private Person',visibilityState:'visible',addEventListener(){},removeEventListener(){},querySelectorAll:()=>[]};
  const window={document,location:{hostname:'go.metix.ai',pathname:'/share/private-person',href:'https://go.metix.ai/share/private-person?u=private-person'},sessionStorage:store(),localStorage:store(),setInterval:()=>1,clearInterval(){},addEventListener(){},removeEventListener(){},dispatchEvent(){},fetch:(path,options)=>fetch(endpoint+path,options)};
  const script=await readFile(new URL('../src/scripts/metix-track.js',import.meta.url),'utf8');
  vm.runInNewContext(script,{window,document,URL,URLSearchParams,console,CustomEvent:class {constructor(type){this.type=type;}}});
  window.metix.track('lookup_success',{result_type:'found'});
  await window.metix.tracker.flush();
  const batch=received.find(row=>row.path==='/api/track/collect/batch');
  assert.ok(batch,'collector must actually receive the HTTP request');
  assert.match(JSON.stringify(batch.body),/lookup_success/);
  assert.doesNotMatch(JSON.stringify(batch.body),/private-person|Private Person/);
  assert.equal(received[0].path,'/peer-rank/rank');
 } finally {
  await proxy?.close();await rm(tempRoot,{recursive:true,force:true});upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));
  for(const [index,key] of ['ATLAS_UPSTREAM','TRACK_UPSTREAM'].entries()) if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];
 }
});
