import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const source=readFileSync(new URL('../nginx/40-campaign-upstreams.sh',import.meta.url),'utf8');
function config(env={}) {
 const dir=mkdtempSync(join(tmpdir(),'rank-nginx-'));const output=join(dir,'upstreams.conf');
 const script=join(dir,'configure.sh');writeFileSync(script,source.replace('/etc/nginx/campaign-upstreams.conf',output));
 const result=spawnSync('sh',[script],{env:{...process.env,ATLAS_UPSTREAM:'',TRACK_UPSTREAM:'',...env},encoding:'utf8'});
 const text=readFileSync(output,'utf8');rmSync(dir,{recursive:true,force:true});return {...result,text};
}
test('unconfigured services return explicit valid JSON with 503',()=>{
 const result=config();assert.equal(result.status,0,result.stderr);
 assert.equal((result.text.match(/return 503 '\{"msg":"Service upstream is not configured"\}';/g)||[]).length,2,result.text);
});
test('nginx strips atlas prefix but preserves collection paths and headers',()=>{
 const result=config({ATLAS_UPSTREAM:'https://rank.internal:8009',TRACK_UPSTREAM:'https://collector.internal'});
 assert.equal(result.status,0,result.stderr);
 assert.match(result.text,/location \^~ \/atlas\/ \{\s+proxy_pass https:\/\/rank.internal:8009\//);
 assert.match(result.text,/location \^~ \/api\/track\/ \{\s+proxy_pass https:\/\/collector.internal;/);
 assert.match(result.text,/proxy_set_header Host \$proxy_host;/);
 assert.match(result.text,/proxy_ssl_verify on;/);
});
test('upstream config rejects injected nginx directives',()=>{
 assert.notEqual(config({ATLAS_UPSTREAM:'https://rank.internal; return 200;'}).status,0);
});
