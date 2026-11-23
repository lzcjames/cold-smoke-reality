#!/usr/bin/env node
'use strict';
// Repack a LICENSED, already measured Reality DEM into exact overlapping tiles.
// Never interpolate, enlarge the mapped extent, or invent heights.
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const sha=buf=>crypto.createHash('sha256').update(buf).digest('hex');
function split(asset,{cells=41}={}) {
  const g=asset?.grid;
  if(!asset || typeof asset.id!=='string' ||
     !g || !Number.isInteger(g.cols) || g.cols<2 ||
     !Number.isInteger(g.rows) || g.rows<2 ||
     !Number.isFinite(g.step) || g.step<=0 ||
     !Number.isFinite(g.east) || !Number.isFinite(g.north) ||
     !Array.isArray(g.heights) || g.heights.length!==g.cols*g.rows ||
     !g.heights.every(v=>Number.isFinite(v)&&v>=0&&v<5000) ||
     !Number.isInteger(cells) || cells<2 || cells>2049)
    throw Error('Valid source Reality DEM and nominal tile cells required');
  const pitch=cells-1, tiles=[];
  for(let y=0;y<g.rows-1;y+=pitch)for(let x=0;x<g.cols-1;x+=pitch) {
    const cols=Math.min(cells,g.cols-x), rows=Math.min(cells,g.rows-y);
    const heights=[];
    for(let j=0;j<rows;j++)
      for(let i=0;i<cols;i++)
        heights.push(g.heights[(y+j)*g.cols+x+i]);
    const tx=x/pitch,ty=y/pitch;
    tiles.push({x:tx,y:ty,cols,rows,heights});
  }
  // Every tile repeats its neighbour's border *from the original source*.
  // This is exact for every original sample, including partial eastern and
  // southern edge tiles, and makes no assertion beyond original bounds.
  return {schema:'cold-smoke-dem-tiles/v1',
    grid:{east:g.east,north:g.north,step:g.step,cells},
    bounds:{cols:g.cols,rows:g.rows},
    resortId:asset.id,sourceHeightSHA256:sha(Buffer.from(JSON.stringify(g.heights))),
    tiles};
}
function write(asset,output,options={}) {
  const result=split(asset,options);
  const target=path.resolve(output);
  fs.mkdirSync(target,{recursive:true});
  const descriptors=[];
  for(const tile of result.tiles){
    const filename='tile_'+tile.x+'_'+tile.y+'.json';
    const bytes=Buffer.from(JSON.stringify(tile));
    fs.writeFileSync(path.join(target,filename),bytes);
    descriptors.push({id:tile.x+':'+tile.y,x:tile.x,y:tile.y,
      url:filename,sha256:sha(bytes)});
  }
  const manifest={schema:result.schema,resortId:result.resortId,
    grid:result.grid,bounds:result.bounds,
    sourceHeightSHA256:result.sourceHeightSHA256,
    tiles:descriptors};
  fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
if(require.main===module) {
  const [source,out,cellsArg]=process.argv.slice(2);
  if(!source||!out) {
    console.error('Usage: node tools/reality/export_dem_tiles.cjs <measured-resort.json> <output-dir> [tile-cells]');
    process.exitCode=1;
  }else{
    try{
      const asset=JSON.parse(fs.readFileSync(source,'utf8'));
      const manifest=write(asset,out,{cells:cellsArg?Number(cellsArg):41});
      console.log('Exported',manifest.tiles.length,'source-exact measured tiles for',
        manifest.resortId,'into',out);
    }catch(e){console.error(e.message);process.exitCode=1;}
  }
}
module.exports={split,write};
