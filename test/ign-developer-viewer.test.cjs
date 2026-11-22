'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const viewer=fs.readFileSync('dev/les2alpes-real-ign.html','utf8');
test('developer IGN viewer JS parses without changing main ski game',()=>{
 const match=viewer.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(match,'standalone viewer must contain its own JS');
 assert.doesNotThrow(()=>new vm.Script(match[1]));
 assert.ok(!/src="https?:/.test(viewer),'viewer must not fetch remote JS');
});
test('real data is verified before any WebGL terrain mesh drawing',()=>{
 const sha=viewer.indexOf('await sha(body)');
 const mesh=viewer.indexOf('const vertex=new Float32Array');
 assert.ok(sha>0 && mesh>sha);
 assert.match(viewer,/manifest\.approvedForGameplay!==false/);
 assert.match(viewer,/manifest\.readyForRuntime!==false/);
 assert.match(viewer,/tile\.approvedForGameplay!==false/);
 assert.match(viewer,/manifest\.tiles\.length!==6/);
 assert.match(viewer,/g\.cols\*g\.rows>4096/);
});
test('viewer provides no links/actions to treat unreviewed piste as playable',()=>{
 assert.match(viewer,/仅开发预览/);
 assert.match(viewer,/不是正式雪道/);
 assert.match(viewer,/IGN/);
 assert.ok(!viewer.includes('Course.height='));
 assert.ok(!viewer.includes('Skier.ground='));
});
