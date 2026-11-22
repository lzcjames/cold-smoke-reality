// Standalone developer visualization for non-playable, real IGN DEM contact.
// All WebGL resources are opt-in and isolated from the production renderer.
const IgnLabRideVisual = (() => {
 function attach({snapshot,manifest,gl,uniformMarker,attrPos,attrNormal,
   base,centerEast,centerNorth,draw,setCamera}) {
   const ride=IgnLabRide.create(snapshot,manifest);
   const start=document.getElementById('ride-start');
   const reset=document.getElementById('ride-reset');
   const readout=document.getElementById('ride-readout');
   const keys=new Set();
   const touch=document.getElementById('touch-controls');
   let active=false,running=false,last=0,carry=0;
   const vb=gl.createBuffer(),ib=gl.createBuffer();
   const pos=new Float32Array(11*6);
   const indices=new Uint16Array([0,2,1,1,2,3,4,6,5,5,6,7,8,9,10]);
   gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);
   gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
   function vertex(i,x,z,offset) {
     const h=ride.sample(x,z);
     if(h===null||!Number.isFinite(h))return false;
     const k=i*6;
     pos[k]=manifest.grid.east+x-centerEast;
     pos[k+1]=h-base+offset;
     pos[k+2]=centerNorth-manifest.grid.north+z;
     pos[k+3]=0;pos[k+4]=1;pos[k+5]=0;
     return true;
   }
   function marker() {
     if(!active)return;
     const s=ride.state(),dx=Math.sin(s.heading),dz=Math.cos(s.heading),
       nx=dz,nz=-dx;
     let index=0;
     for(const side of [-1,1])for(const front of [-1,1])for(const edge of [-1,1]){
       const w=side*.24+edge*.10;
       if(!vertex(index++,s.x+nx*w+front*dx,
                         s.z+nz*w+front*dz,.22))return;
     }
     if(!vertex(8,s.x,s.z,1.6)||!vertex(9,s.x+dx*.7,s.z+dz*.7,1)||
        !vertex(10,s.x-dx*.7,s.z-dz*.7,1))return;
     gl.uniform1f(uniformMarker,1);
     gl.bindBuffer(gl.ARRAY_BUFFER,vb);
     gl.bufferData(gl.ARRAY_BUFFER,pos,gl.DYNAMIC_DRAW);
     gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);
     gl.enableVertexAttribArray(attrPos);gl.enableVertexAttribArray(attrNormal);
     gl.vertexAttribPointer(attrPos,3,gl.FLOAT,false,24,0);
     gl.vertexAttribPointer(attrNormal,3,gl.FLOAT,false,24,12);
     gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
     gl.uniform1f(uniformMarker,0);
   }
   function cameraCenter(){
     if(!active)return null;
     const s=ride.state();
     return [manifest.grid.east+s.x-centerEast,
       s.altitudeM-base+4,centerNorth-manifest.grid.north+s.z];
   }
   function stats(){
     const s=ride.state();
     readout.textContent='海拔 '+s.altitudeM.toFixed(1)+'m · '+(s.speed*3.6).toFixed(0)+
       'km/h · '+(s.stoppedAtBoundary?'已到达实测边界，安全停止':
       s.released?'实测地形接触运行中':'静止接触稳定 · 按 W 起滑')+
       ' · W 加速 / A D 转向 / S 刹车';
   }
   function frame(timestamp) {
     if(!running)return;
     carry=Math.min(.12,carry+Math.min(.1,(timestamp-last)/1000||0));
     last=timestamp;let count=0;
     while(carry>=ride.fixedStep&&count<8){
       const right=keys.has('d')||keys.has('arrowright');
       const left=keys.has('a')||keys.has('arrowleft');
       ride.step(ride.fixedStep,{
         push:keys.has('w')||keys.has('arrowup'),
         brake:keys.has('s')||keys.has('arrowdown'),
         steer:Number(right)-Number(left)});
       carry-=ride.fixedStep;count++;
     }
     stats();draw();requestAnimationFrame(frame);
   }
   start.disabled=false;
   start.addEventListener('click',()=>{
     if(running)return;
     ride.start();active=true;running=true;carry=0;last=performance.now();
     setCamera(220);start.disabled=true;reset.disabled=false;
     if(touch)touch.hidden=false;
     requestAnimationFrame(frame);
   });
   reset.addEventListener('click',()=>{
     running=false;active=false;ride.reset();keys.clear();setCamera(3300);
     if(touch)touch.hidden=true;
     start.disabled=false;reset.disabled=true;
     readout.textContent='仅地形接触实验 · W 加速、A/D 转向、S 刹车';
     draw();
   });
   const controls=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);
   document.addEventListener('keydown',e=>{
     const key=e.key.toLowerCase();
     if(controls.has(key)){if(active)e.preventDefault();keys.add(key);}
   });
   document.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
   window.addEventListener('blur',()=>keys.clear());
   // On-screen controls use the very same state as the keyboard, and
   // releases are fail-safe on pointer cancellation, blur or reset.
   if(touch)for(const button of touch.querySelectorAll('button[data-control]')){
     const key=button.dataset.control;
     if(!['w','a','s','d'].includes(key))continue;
     const release=e=>{
       keys.delete(key);
       if(e && button.hasPointerCapture?.(e.pointerId))
         button.releasePointerCapture(e.pointerId);
     };
     button.addEventListener('pointerdown',e=>{
       if(!active)return;
       e.preventDefault();keys.add(key);
       button.setPointerCapture(e.pointerId);
     });
     button.addEventListener('pointerup',release);
     button.addEventListener('pointercancel',release);
     button.addEventListener('lostpointercapture',()=>keys.delete(key));
   }
   // Browser test hook exposes only a source-only, isolated numeric proxy.
   return Object.freeze({drawMarker:marker,cameraCenter,
     ride:Object.freeze({start:()=>ride.start(),step:(dt,c)=>ride.step(dt,c),
       reset:()=>ride.reset(),state:()=>ride.state(),sourceOnly:true,
       approvedForGameplay:false})});
 }
 return Object.freeze({attach});
})();
