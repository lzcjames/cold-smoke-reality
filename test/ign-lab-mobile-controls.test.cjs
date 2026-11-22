'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('dev/les2alpes-real-ign.html','utf8');
const visual=fs.readFileSync('dev/ign-lab-ride-visual.js','utf8');
test('source-only ride remains the only user of the new touch buttons',()=>{
 assert.match(html,/id="touch-controls" hidden/);
 for(const key of ['w','a','s','d'])assert.ok(html.includes('data-control="'+key+'"'));
 assert.match(visual,/touch\.hidden=false/);
 assert.match(visual,/touch\.hidden=true/);
 assert.match(visual,/pointercancel/);
 assert.match(visual,/lostpointercapture/);
 assert.doesNotThrow(()=>new vm.Script(visual));
});
test('camera zoom remains close while diagnostic ride is active',()=>{
 assert.match(html,/rideView\.cameraCenter\(\)\?90:1800/);
 assert.match(html,/rideView\.cameraCenter\(\)\?1600:10000/);
});
