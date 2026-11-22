// Developer-only deterministic contact experiment on genuinely measured IGN DEM.
// NOT the production Skier, not a piste, and never a source of invented ground.
const IgnLabRide = (() => {
  const fixed=1/60, lengthM=1.9, halfSkiSpacing=.24;
  const finite=v=>Number.isFinite(v);
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  function create(snapshot,manifest) {
    if(!snapshot||snapshot.sourceOnly!==true||
       snapshot.approvedForGameplay!==false||snapshot.readyForPhysics!==false||
       typeof snapshot.sample!=='function'||
       manifest?.schema!=='cold-smoke-measured-tiles-staging/v1'||
       manifest.approvedForGameplay!==false||manifest.readyForRuntime!==false||
       !/^[a-f0-9]{64}$/.test(manifest.sourceOSMSHA256||''))
      throw Error('Measured IGN source-only height snapshot required');
    const g=manifest.grid;
    if(!g||!finite(g.east)||!finite(g.north)||!finite(g.step)||
      g.step<=0||!Number.isInteger(g.cols)||g.cols<12||
      !Number.isInteger(g.rows)||g.rows<12)throw Error('Incomplete real measured footprint');
    // Work entirely in a local metric frame to avoid large float GPU origins.
    const sample=(x,z)=>snapshot.sample(g.east+x,g.north-z);
    function groundAt(x,z,heading){
      const dx=Math.sin(heading),dz=Math.cos(heading);
      const nx=dz,nz=-dx;
      const tips=[];
      for(const side of [-1,1]){
        const sx=x+side*halfSkiSpacing*nx,sz=z+side*halfSkiSpacing*nz;
        const a=sample(sx+.5*lengthM*dx,sz+.5*lengthM*dz);
        const b=sample(sx-.5*lengthM*dx,sz-.5*lengthM*dz);
        if(a===null||b===null||!finite(a)||!finite(b))return null;
        tips.push(a,b);
      }
      const center=sample(x,z);
      if(center===null||!finite(center))return null;
      return {height:center,tipHeights:tips};
    }
    function chooseSpawn(){
      const maxX=(g.cols-1)*g.step,maxZ=(g.rows-1)*g.step;
      let best=null;
      // Source-only geometry sampling; no fabricated route or skiable boundary.
      for(let row=8;row<g.rows-8;row+=6)for(let col=8;col<g.cols-8;col+=8){
        const x=col*g.step,z=row*g.step,h=sample(x,z);
        if(h===null||!finite(h))continue;
        if(!best||h>best.height)best={x,z,height:h};
      }
      if(!best)throw Error('No measured interior available for contact experiment');
      const slopeX=(sample(best.x+2,best.z)-sample(best.x-2,best.z))/4;
      const slopeZ=(sample(best.x,best.z+2)-sample(best.x,best.z-2))/4;
      const heading=Math.atan2(-slopeX,-slopeZ);
      const at=groundAt(best.x,best.z,heading);
      if(at===null)throw Error('No verified ski contacts at measurement start');
      return {...best,heading:finite(heading)?heading:0};
    }
    const spawn=chooseSpawn();
    let x=spawn.x,z=spawn.z,heading=spawn.heading,speed=0,started=false,
      released=false,stoppedAtBoundary=false,frames=0,height=spawn.height,verticalJitterM=0;
    function reset(){
      x=spawn.x;z=spawn.z;heading=spawn.heading;speed=0;
      started=false;released=false;stoppedAtBoundary=false;frames=0;
      height=spawn.height;verticalJitterM=0;
      return state();
    }
    function state(){
      return Object.freeze({x,z,heading,speed,altitudeM:height,
        started,released,stoppedAtBoundary,frames,
        verticalJitterM,sourceOnly:true,approvedForGameplay:false});
    }
    function step(dt,controls={}){
      if(!finite(dt)||dt<=0||dt>fixed+.00001)
        throw Error('Fixed 60Hz diagnostic contact timestep required');
      if(!started)return state();
      const steer=clamp(Number(controls.steer)||0,-1,1);
      const push=!!controls.push,brake=!!controls.brake;
      if(push)released=true;
      if(stoppedAtBoundary)return state();
      // At zero speed the rider is stable until deliberate user launch.
      if(!released){frames++;return state();}
      // Surface gradient comes exclusively from independently measured samples.
      const hXP=sample(x+2,z),hXM=sample(x-2,z),
        hZP=sample(x,z+2),hZM=sample(x,z-2);
      if([hXP,hXM,hZP,hZM].some(v=>v===null||!finite(v))){
        speed=0;stoppedAtBoundary=true;return state();
      }
      const gradX=(hXP-hXM)/4,gradZ=(hZP-hZM)/4;
      heading+=steer*(.5+Math.min(speed/14,1)*.6)*dt;
      const dirX=Math.sin(heading),dirZ=Math.cos(heading);
      const downhill=-9.81*(gradX*dirX+gradZ*dirZ)/
         Math.sqrt(1+gradX*gradX+gradZ*gradZ);
      const acceleration=downhill+(push?1.8:0)-.25-.045*speed-(brake?14:0);
      const nextSpeed=clamp(speed+acceleration*dt,0,17);
      const nx=x+dirX*nextSpeed*dt,nz=z+dirZ*nextSpeed*dt;
      const contact=groundAt(nx,nz,heading);
      if(!contact){
        stoppedAtBoundary=true;speed=0;frames++;return state();
      }
      x=nx;z=nz;speed=nextSpeed;height=contact.height;frames++;
      // No terrain extrapolation and no camera/body spring feedback; height
      // comes directly from the same continuous measured DEM snapshot.
      return state();
    }
    function start(){
      started=true;return state();
    }
    return Object.freeze({start,step,reset,state,groundAt,
      sample,spawn:Object.freeze(spawn),fixedStep:fixed,
      sourceOnly:true,approvedForGameplay:false});
  }
  return Object.freeze({create});
})();
