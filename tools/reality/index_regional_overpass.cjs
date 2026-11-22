#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const {fromOverpassBytes}=require('./overpass_region_source.cjs');
function main(args){
 const [input,output,...bbox]=args;
 if(!input||!output||bbox.length!==4)
   throw Error('Usage: node tools/reality/index_regional_overpass.cjs <raw.json> <index.json> <south> <west> <north> <east>');
 const data=fromOverpassBytes(fs.readFileSync(input),{surveyBBox:bbox.map(Number)});
 fs.writeFileSync(output,JSON.stringify(data,null,2)+'\n');
 console.log('Regional OSM candidates:',data.features.length,
  'NOT verified Les Deux Alpes membership or full resort coverage');
 return data;
}
if(require.main===module){
 try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={main};
