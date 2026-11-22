// Opt-in read-only mesh geometry from authenticated, staged IGN DEM tiles.
// No route, physics, renderer or playable-terrain promotion takes place here.
const TerrainSourceMesh = (() => {
  function fromMeasuredTile(tile,{originEast,originNorth,baseElevationM=0,
    maxVertices=16384,maxTriangles=32768}={}) {
    const g=tile?.grid;
    if(!tile||typeof tile.name!=='string'||
       !/^tile-[0-9]+-[0-9]+\.json$/.test(tile.name)||
       !g||!Number.isInteger(g.cols)||g.cols<2||
       !Number.isInteger(g.rows)||g.rows<2||
       !Number.isFinite(g.step)||g.step<=0||
       !Number.isFinite(g.east)||!Number.isFinite(g.north)||
       !g.heights||g.heights.length!==g.cols*g.rows||
       !Number.isFinite(originEast)||!Number.isFinite(originNorth)||
       !Number.isFinite(baseElevationM)||
       !Number.isInteger(maxVertices)||maxVertices<4||
       !Number.isInteger(maxTriangles)||maxTriangles<2)
       throw Error('Invalid measured-source preview geometry');
    const count=g.cols*g.rows,triangles=(g.cols-1)*(g.rows-1)*2;
    if(count>maxVertices||triangles>maxTriangles)
      throw Error('Measured source mesh exceeds vertex or triangle budget');
    const positions=new Float32Array(count*3),
      normals=new Float32Array(count*3),
      indices=new Uint32Array(triangles*3);
    const step=g.step;
    let minY=Infinity,maxY=-Infinity;
    for(let r=0;r<g.rows;r++)for(let c=0;c<g.cols;c++){
      const i=r*g.cols+c,h=Number(g.heights[i]);
      if(!Number.isFinite(h)||h<0||h>=5000)
        throw Error('Missing or unmeasured source DEM elevation');
      const x=(g.east+c*step)-originEast;
      const z=originNorth-(g.north-r*step);
      const y=h-baseElevationM;
      if(![x,y,z].every(Number.isFinite)||Math.max(Math.abs(x),Math.abs(y),Math.abs(z))>100000)
        throw Error('Invalid metre-relative source tile frame');
      positions[3*i]=x;positions[3*i+1]=y;positions[3*i+2]=z;
      minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
    let k=0;
    // r increases towards geographic south (positive local z), so these
    // index orders give +Y for a flat surface in x,y,z.
    for(let r=0;r<g.rows-1;r++)for(let c=0;c<g.cols-1;c++){
      const a=r*g.cols+c,b=a+1,d=a+g.cols,e=d+1;
      indices[k++]=a;indices[k++]=d;indices[k++]=b;
      indices[k++]=b;indices[k++]=d;indices[k++]=e;
    }
    // Derive smooth normals from measured height differences, no random
    // displacement. One-sided derivatives at tile edges have no fake data.
    for(let r=0;r<g.rows;r++)for(let c=0;c<g.cols;c++){
      const i=r*g.cols+c;
      const l=positions[3*(r*g.cols+Math.max(0,c-1))+1],
        rr=positions[3*(r*g.cols+Math.min(g.cols-1,c+1))+1],
        u=positions[3*(Math.max(0,r-1)*g.cols+c)+1],
        d=positions[3*(Math.min(g.rows-1,r+1)*g.cols+c)+1];
      const dx=(rr-l)/(step*(c===0||c===g.cols-1?1:2));
      const dz=(d-u)/(step*(r===0||r===g.rows-1?1:2));
      const inv=1/Math.hypot(dx,1,dz);
      normals[3*i]=-dx*inv;normals[3*i+1]=inv;normals[3*i+2]=-dz*inv;
    }
    return Object.freeze({
      name:tile.name,originEast,originNorth,baseElevationM,
      vertexCount:count,triangleCount:triangles,positions,normals,indices,
      minimumLocalElevationM:minY,maximumLocalElevationM:maxY,
      approvedForGameplay:false,readyForCollision:false
    });
  }
  return Object.freeze({fromMeasuredTile});
})();
