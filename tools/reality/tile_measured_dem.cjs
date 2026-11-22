'use strict';
// Source-only DEM tiler: adjacent chunks share a full 1-cell boundary.
// Does not turn measured elevations into a playable piste or safety polygon.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function split(asset,{tileCells=64,maxTileBytes=256*1024}={}){
 const g=asset?.grid;
 if(asset?.schema!=='cold-smoke-measured-dem-staging/v1'||
    asset.approvedForGameplay!==false||asset.mergedIntoResort!==false||
    !/^[0-9a-f]{64}$/.test(asset.sourceOSMSHA256||'')||
    !g||!Number.isInteger(g.cols)||g.cols<2||g.cols>1200||
    !Number.isInteger(g.rows)||g.rows<2||g.rows>1200||
    !Number.isFinite(g.step)||g.step<=0||
    !Number.isFinite(g.east)||!Number.isFinite(g.north)||
    !Array.isArray(g.heights)||g.heights.length!==g.cols*g.rows||
    g.heights.some(h=>!Number.isFinite(h)||h<0||h>=5000)||
    !Number.isInteger(tileCells)||tileCells<3||tileCells>128||
    !Number.isInteger(maxTileBytes)||maxTileBytes<1024)
    throw Error('Only finite measured staging terrain with bounded output tiles is accepted');
 const stride=tileCells-1,tiles=[],entries=[];
 for(let sy=0,yi=0;sy<g.rows-1;sy+=stride,yi++)
  for(let sx=0,xi=0;sx<g.cols-1;sx+=stride,xi++){
   const cols=Math.min(tileCells,g.cols-sx),rows=Math.min(tileCells,g.rows-sy);
   const heights=[];
   for(let j=0;j<rows;j++)
    heights.push(...g.heights.slice((sy+j)*g.cols+sx,(sy+j)*g.cols+sx+cols));
   const tile={schema:'cold-smoke-dem-source-tile/v1',
     resortId:asset.resortId,routeName:asset.routeName,
     sourceOSMSHA256:asset.sourceOSMSHA256,
     approvedForGameplay:false,
     xIndex:xi,yIndex:yi,
     startCol:sx,startRow:sy,
     grid:{cols,rows,step:g.step,east:g.east+sx*g.step,
       north:g.north-sy*g.step,heights}};
   const raw=JSON.stringify(tile)+'\n',bytes=Buffer.byteLength(raw);
   if(bytes>maxTileBytes)throw Error('Source terrain tile exceeds budget; lower tileCells');
   const name='tile-'+xi+'-'+yi+'.json';
   entries.push({filename:name,sha256:sha(raw),bytes,
     startCol:sx,startRow:sy,cols,rows,
     boundsLambert93:[tile.grid.east,tile.grid.north-(rows-1)*g.step,
      tile.grid.east+(cols-1)*g.step,tile.grid.north]});
   tiles.push({name,raw});
  }
 return {manifest:{schema:'cold-smoke-measured-tiles-staging/v1',
   resortId:asset.resortId,routeName:asset.routeName,
   sourceOSMSHA256:asset.sourceOSMSHA256,
   originalGridSHA256:sha(JSON.stringify(g)),
   grid:{cols:g.cols,rows:g.rows,step:g.step,east:g.east,north:g.north},
   tileCells,sourceTileCount:entries.length,sourceOnly:true,
   approvedForGameplay:false,readyForRuntime:false,tiles:entries},tiles};
}
function verify(manifest,loadTile){
 if(manifest?.schema!=='cold-smoke-measured-tiles-staging/v1'||
    manifest.sourceOnly!==true||manifest.approvedForGameplay!==false||
    manifest.readyForRuntime!==false||
    !Array.isArray(manifest.tiles)||!manifest.tiles.length||
    typeof loadTile!=='function')throw Error('Untrusted measured terrain tile manifest');
 const g=manifest.grid,out=new Array(g.cols*g.rows);
 const written=new Uint8Array(out.length);
 if(!Number.isInteger(g.cols)||g.cols<2||!Number.isInteger(g.rows)||g.rows<2||
    g.cols*g.rows>1200*1200||!Number.isFinite(g.step)||g.step<=0)
   throw Error('Invalid parent source grid');
 const names=new Set();
 for(const e of manifest.tiles){
  if(names.has(e.filename)||!/^tile-[0-9]+-[0-9]+\.json$/.test(e.filename))
   throw Error('Duplicate/unsafe terrain tile filename');
  names.add(e.filename);
  const raw=loadTile(e.filename);
  if(typeof raw!=='string'||sha(raw)!==e.sha256||Buffer.byteLength(raw)!==e.bytes)
   throw Error('Original terrain tile hash or byte length changed');
  const tile=JSON.parse(raw),t=tile.grid;
  if(tile.schema!=='cold-smoke-dem-source-tile/v1'||
     tile.approvedForGameplay!==false||tile.resortId!==manifest.resortId||
     tile.sourceOSMSHA256!==manifest.sourceOSMSHA256||
     tile.routeName!==manifest.routeName||
     tile.startCol!==e.startCol||tile.startRow!==e.startRow||
     !t||t.cols!==e.cols||t.rows!==e.rows||
     !Number.isInteger(e.startCol)||!Number.isInteger(e.startRow)||
     e.startCol<0||e.startRow<0||
     e.startCol+e.cols>g.cols||e.startRow+e.rows>g.rows||
     t.step!==g.step||Math.abs(t.east-(g.east+e.startCol*g.step))>0.0001||
     Math.abs(t.north-(g.north-e.startRow*g.step))>0.0001||
     !Array.isArray(t.heights)||t.heights.length!==e.cols*e.rows)
    throw Error('Terrain tile georeference or source identity is incorrect');
  for(let y=0;y<e.rows;y++)for(let x=0;x<e.cols;x++){
   const h=t.heights[y*e.cols+x],k=(e.startRow+y)*g.cols+e.startCol+x;
   if(!Number.isFinite(h)||h<0||h>=5000)
     throw Error('Invalid detailed DEM tile height');
   if(written[k]&&out[k]!==h)throw Error('DEM shared tile border mismatch');
   out[k]=h;written[k]=1;
  }
 }
 if(written.some(x=>x!==1))throw Error('Uncovered measured DEM tile in source grid');
 if(sha(JSON.stringify({...g,heights:out}))!==manifest.originalGridSHA256)
  throw Error('Reassembled original measured DEM does not match');
 return {tiles:manifest.tiles.length,cols:g.cols,rows:g.rows,
   originalGridVerified:true,approvedForGameplay:false};
}
function main(args){
 const [input,dir,...rest]=args;
 if(!input||!dir)throw Error('Usage: node tools/reality/tile_measured_dem.cjs <measured-staging.json> <directory> [tile-cells]');
 const data=JSON.parse(fs.readFileSync(input,'utf8'));
 const packed=split(data,{tileCells:rest[0]?Number(rest[0]):64});
 fs.mkdirSync(dir,{recursive:true});
 for(const t of packed.tiles)fs.writeFileSync(path.join(dir,t.name),t.raw);
 const result=verify(packed.manifest,n=>fs.readFileSync(path.join(dir,n),'utf8'));
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(packed.manifest,null,2)+'\n');
 console.log('Validated',result.tiles,'non-playable DEM tiles; full source grid identical');
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){
 console.error(e.message);process.exitCode=1;
}}
module.exports={split,verify,main};
