#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const {normalizeOsmSurvey}=require('./osm_survey_adapter.cjs');
function main(args) {
 const [input,resortId,output,...routeNames]=args;
 if(!input||!resortId||!output)
   throw Error('Usage: node tools/reality/import_osm_survey.cjs <OSM-index.json> <resort-id> <output.json> [exact-route-names...]');
 const index=JSON.parse(fs.readFileSync(input,'utf8'));
 const result=normalizeOsmSurvey(index,{resortId,
   names:routeNames.length?routeNames:null});
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
 console.log('Imported original OSM survey:',result.ways.length,'ways,',
   result.routes.length,'route labels; playable approvals: 0');
 return result;
}
if(require.main===module) {
 try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={main};
