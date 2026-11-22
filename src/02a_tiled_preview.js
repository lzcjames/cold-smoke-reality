// Opt-in bridge: exercise the real measured Reality DEM through the tiled
// sampler without changing the game's existing data, terrain extents or physics.
// All tiles are preloaded synchronously from the already validated source grid.
// THIS IS NOT resort-wide streaming, and never fabricates unmeasured terrain.
const RealityTilePreview = (() => {
  function fromGrid(grid, nominalCells = 41) {
    const {east,north,step,cols,rows,heights} = grid || {};
    if (!Number.isInteger(cols) || cols < 2 || !Number.isInteger(rows) || rows < 2 ||
        !Number.isInteger(nominalCells) || nominalCells < 2 ||
        !Number.isFinite(step) || step <= 0 ||
        !Number.isFinite(east) || !Number.isFinite(north) ||
        !heights || heights.length !== rows*cols)
      throw Error('Measured Reality DEM required for tiled preview');
    const dem = TiledDEM.create({east,north,step,cells:nominalCells});
    const pitch = nominalCells - 1;
    for(let y=0;y<rows-1;y+=pitch)for(let x=0;x<cols-1;x+=pitch) {
      const width=Math.min(nominalCells,cols-x), height=Math.min(nominalCells,rows-y);
      const samples = new Array(width*height);
      for(let j=0;j<height;j++)for(let i=0;i<width;i++)
        samples[j*width+i]=heights[(y+j)*cols+x+i];
      dem.add({x:x/pitch,y:y/pitch,cols:width,rows:height,heights:samples});
    }
    return Object.freeze({
      tiles:dem.loaded(),
      height(e,n) {
        const value=dem.sample(e,n);
        if(value===null)throw Error('Preview DEM sample outside measured grid');
        return value;
      },
      // The existing renderer samples outside the playable DEM to draw
      // distant clamped edges. This preview leaves that legacy rule intact.
      covers(e,n) {
        const eps=1e-7;
        return e>=east-eps && e<=east+(cols-1)*step+eps &&
          n<=north+eps && n>=north-(rows-1)*step-eps;
      }
    });
  }
  return Object.freeze({fromGrid});
})();
if(typeof module!=='undefined' && module.exports)module.exports=RealityTilePreview;
