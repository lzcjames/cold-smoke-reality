#!/usr/bin/env node
'use strict';
// Convert a licensed, already decoded world JSON into a portable descriptor.
// The Hemu archive wraps world data in JavaScript; this importer intentionally
// DOES NOT execute unknown JS. Export JSON explicitly before calling it.
const fs=require('node:fs');
const {normalize}=require('./portable_resort_adapter.cjs');
function main(argv) {
 const [input,resortId,output]=argv;
 if(!input||!resortId||!output)
   throw Error('Usage: node tools/reality/import_portable_resort.cjs <world.json> <resort-id> <output.json>');
 const raw=JSON.parse(fs.readFileSync(input,'utf8'));
 const world=raw.world||raw;
 const result=normalize(world,{resortId,
   originalSource:input,sourceFormat:'hemu-world-like'});
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
 console.log('Imported metadata only:',result.pistes.length,'pistes,',
   result.lifts.length,'lifts,',result.stations.length,'stations; NOT playable');
 return result;
}
if(require.main===module) {
 try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={main};
