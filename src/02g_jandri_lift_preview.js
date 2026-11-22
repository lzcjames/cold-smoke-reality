// Tiny homepage-only Jandri lift topology diagram. Not a georeferenced map,
// not a cabin simulator, and not proof that boarding is allowed.
// It has no GPU resources, world positions, simulation tick or ski callbacks.
const JandriLiftPreview = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const xy = [[45,108],[225,68],[405,30]];
  const create = (name, attrs, parent) => {
    const node = document.createElementNS(NS,name);
    for (const key in attrs) node.setAttribute(key,String(attrs[key]));
    if (parent) parent.appendChild(node);
    return node;
  };
  function init(host, network) {
    if (!host || !network || network.stations?.length!==3 ||
        network.legs?.length!==2) return null;
    // Never present animated diagrams as measured cabin travel/actual timing.
    const label = document.createElement('div');
    label.className = 'jandri-schematic-label';
    label.textContent = '线路拓扑示意 · 非实景坐标 · 车厢速度非实测';
    const svg=create('svg',{
      viewBox:'0 0 450 152',role:'img',
      'aria-label':'Jandri 3S 冬季两段线路拓扑示意：1650 至 2600 至 3200。不是地理位置或真实缆车速度。',
      focusable:'false'},host);
    const title=create('title',{},svg);
    title.textContent='Jandri 3S 线路拓扑示意（不是精确地图）';
    const legViews=[];
    const styles=['#a8d5e9','#ffe5af'];
    for (let i=0;i<network.legs.length;i++) {
      const [x1,y1]=xy[i], [x2,y2]=xy[i+1];
      const group=create('g',{'data-jandri-leg':network.legs[i].id},svg);
      const wire=create('line',{x1,y1,x2,y2,stroke:styles[i],
        'stroke-width':2.5,'stroke-linecap':'round'},group);
      const cabine=create('g',{'aria-hidden':'true'},group);
      const body=create('rect',{x:-8,y:-4,width:16,height:11,rx:3,
        stroke:'#e9f5fc','stroke-width':1,fill:'#2a5977'},cabine);
      create('line',{x1:0,y1:-8,x2:0,y2:-4,stroke:'#d5e7ef','stroke-width':1.5},cabine);
      // Decorative travel in a self-contained SVG only. Not scaled to
      // real mountain distance, travel time, elevation or published speed.
      const motion=create('animateMotion',{dur:'12s',repeatCount:'indefinite',
        path:'M'+x1+','+(y1+4)+' L'+x2+','+(y2+4)},cabine);
      legViews.push({group,motion,wire,body});
    }
    network.stations.forEach((station,i)=>{
      const [x,y]=xy[i];
      create('circle',{cx:x,cy:y,r:6,fill:'#f4e8cc',
        stroke:'#1d394a','stroke-width':2},svg);
      const t=create('text',{x,y:y+27,'text-anchor':'middle',
        fill:'#dcecf7','font-size':13,'font-weight':'600'},svg);
      t.textContent=String(station.sectorAltitudeM);
    });
    host.appendChild(label);
    function paint(plan) {
      if (!plan || !Array.isArray(plan.legs)) return;
      const selected=new Set(plan.legs.map(x=>x.id));
      legViews.forEach(({group,motion,wire},i)=>{
        const active=selected.has(network.legs[i].id);
        group.setAttribute('opacity',active?'1':'0.25');
        // No cabling animation on the inactive second section.
        // Freeze is preferred to removing the SMIL node during changes.
        motion.setAttribute('repeatCount',active?'indefinite':'0');
        wire.setAttribute('stroke-width',active?'2.5':'1.2');
      });
    }
    return Object.freeze({paint});
  }
  return Object.freeze({init});
})();
