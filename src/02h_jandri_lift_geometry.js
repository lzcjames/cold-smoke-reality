// Independent, optional lift mesh input preparation: NO approved coordinates
// exist yet. Callers must supply a separately audited georeferenced station/
// tower pack. This module NEVER invents station/tower positions or boarding.
const JandriLiftGeometry = (() => {
  const idOrder=['les-deux-alpes-1650','jandri-2600','jandri-3200'];
  const wayOrder=['way/1229057878','way/1361005452'];
  const point = p => Array.isArray(p) && p.length===3 && p.every(
    x => Number.isFinite(x) && Math.abs(x)<1e8);
  const same = (a,b) => a.length===b.length && a.every((x,i)=>x===b[i]);
  const safe = q => !q || q.every(point);
  function validate(pack) {
    if (!pack || pack.season!=='winter' ||
        pack.resortId!=='les-deux-alpes' ||
        pack.status!=='independently_source_validated' ||
        !/^[a-f0-9]{64}$/.test(pack.sourceSha256||'') ||
        !same(pack.stationIds||[],idOrder) ||
        !same(pack.liftOsmIds||[],wayOrder) ||
        !Array.isArray(pack.stations) || pack.stations.length!==3 ||
        !Array.isArray(pack.legs) || pack.legs.length!==2)
      throw Error('Unverified Jandri lift geometry pack');
    for(let i=0;i<3;i++) {
      const s=pack.stations[i];
      if (!s || s.id!==idOrder[i] || !point(s.anchor) ||
          s.measuredPlatformLocation!==true ||
          s.verifiedTerrainGround!==true)
        throw Error('Jandri station geometry needs independent surveyed points');
    }
    for(let i=0;i<2;i++) {
      const leg=pack.legs[i];
      if (!leg || leg.osmWay!==wayOrder[i] ||
          !Array.isArray(leg.towers) || !leg.towers.length ||
          leg.towers.length>100 ||
          leg.towers.some(t=>!t || !point(t.anchor) ||
            t.measuredStructurePosition!==true ||
            t.verifiedTerrainClearance!==true))
        throw Error('Jandri cable supports need surveyed tower locations');
    }
    return true;
  }
  function centerline(pack, legIndex) {
    validate(pack);
    if (!Number.isInteger(legIndex) || legIndex<0 || legIndex>1)
      throw Error('Invalid lift leg');
    const a=pack.stations[legIndex].anchor;
    const b=pack.stations[legIndex+1].anchor;
    // Station/tower points are all from the audited pack, no interpolation
    // across unknown supports. Drawing uses fixed straight segments between
    // source points; actual cable sag, cabin motion, and clearance still need
    // separate engineering evidence and renderer integration.
    const raw=[a,...pack.legs[legIndex].towers.map(t=>t.anchor),b];
    return Object.freeze(raw.map(p=>Object.freeze(p.slice())));
  }
  return Object.freeze({validate,centerline});
})();
