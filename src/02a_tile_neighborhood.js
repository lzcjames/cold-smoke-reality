// Select source-pinned terrain tiles around the skier and slightly ahead.
// This planner does not trigger gameplay, generate geography or infer missing tiles.
const TerrainTileNeighborhood = (() => {
  const finitePair = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  function create({scheme, tileIds, radius = 1, lookaheadSeconds = 1.5, budget = 9}) {
    const {east, north, span} = scheme || {};
    if (![east,north,span,lookaheadSeconds].every(Number.isFinite) || span <= 0 ||
        lookaheadSeconds < 0 || lookaheadSeconds > 10 ||
        !Number.isInteger(radius) || radius < 0 || radius > 4 ||
        !Number.isInteger(budget) || budget < 1 || budget > 81 ||
        !Array.isArray(tileIds) || tileIds.some(id => !/^-?\d+:-?\d+$/.test(id)) ||
        new Set(tileIds).size !== tileIds.length)
      throw Error('Invalid terrain neighborhood scheme or catalog');
    const catalog = new Set(tileIds);
    const tile = (e, n) => [Math.floor((e - east) / span),
      Math.floor((north - n) / span)];
    const name = (x,y) => x + ':' + y;
    function select(position, velocity = [0,0]) {
      if (!finitePair(position) || !finitePair(velocity))
        throw Error('Invalid skier projected position or velocity');
      const [cx,cy] = tile(...position);
      const center = name(cx,cy);
      if (!catalog.has(center))
        return {ready:false, center, ids:[], missingCenter:true};
      const [aheadX,aheadY] = tile(position[0] + velocity[0]*lookaheadSeconds,
        position[1] + velocity[1]*lookaheadSeconds);
      const candidates=[];
      for(let y=cy-radius;y<=cy+radius;y++) for(let x=cx-radius;x<=cx+radius;x++) {
        const id=name(x,y);
        if(!catalog.has(id)) continue;
        const distance=(x-cx)**2+(y-cy)**2;
        const ahead=(x-aheadX)**2+(y-aheadY)**2;
        candidates.push({id,distance,ahead});
      }
      candidates.sort((a,b)=> (a.id===center?-1:b.id===center?1:0) ||
        (a.ahead-b.ahead) || (a.distance-b.distance) ||
        a.id.localeCompare(b.id));
      return {ready:true,center,ids:candidates.slice(0,budget).map(x=>x.id),
        missingCenter:false};
    }
    async function loadFor(stream, position, velocity) {
      const choice=select(position,velocity);
      if(!choice.ready) return choice;
      if(!stream || typeof stream.retain!=='function')
        throw Error('Verified tile stream required');
      await stream.retain(choice.ids);
      return choice;
    }
    function tileIdAt(position) {
      if (!finitePair(position)) throw Error('Invalid projected tile position');
      return name(...tile(...position));
    }
    const known = id => catalog.has(id);
    return Object.freeze({select,loadFor,tileIdAt,known});
  }
  return Object.freeze({create});
})();
if (typeof module !== 'undefined' && module.exports)
  module.exports = TerrainTileNeighborhood;
