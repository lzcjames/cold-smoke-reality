#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const {inventory}=require('./resort_wide_inventory.cjs');
function main(args){
 const [registry,source,out]=args;
 if(!registry||!source||!out)
  throw Error('Usage: node tools/reality/report_resort_inventory.cjs <official-sectors.json> <pinned-OSM-index.json> <output.json>');
 const data=inventory(JSON.parse(fs.readFileSync(registry,'utf8')),
  JSON.parse(fs.readFileSync(source,'utf8')));
 fs.writeFileSync(out,JSON.stringify(data,null,2)+'\n');
 console.log('Official map sectors:',data.officialMapSectorCount,
   'Pinned OSM ways:',data.osm.knownDownhillWays,
   'Whole resort GIS complete:',data.wholeResortSurveyComplete);
 return data;
}
if(require.main===module){
 try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={main};
