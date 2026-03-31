(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))r(n);new MutationObserver(n=>{for(const s of n)if(s.type==="childList")for(const i of s.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&r(i)}).observe(document,{childList:!0,subtree:!0});function o(n){const s={};return n.integrity&&(s.integrity=n.integrity),n.referrerPolicy&&(s.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?s.credentials="include":n.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function r(n){if(n.ep)return;n.ep=!0;const s=o(n);fetch(n.href,s)}})();const ge=Math.sqrt(3);function me(e,t,o=70){const r=o*ge/2,n=o/2,s=Math.ceil(t/r)+1,i=Math.ceil(e/n)+1,l=[];for(let a=0;a<s;a++)for(let c=0;c<i;c++){const p=(a+c)%2===0,d=xe(a,c,n,r,p),C=(d[0][0]+d[1][0]+d[2][0])/3,S=(d[0][1]+d[1][1]+d[2][1])/3;l.push({row:a,col:c,points:d,cx:C,cy:S,up:p})}return{triangles:l,cols:i,rows:s,triHeight:r,triSide:o}}function xe(e,t,o,r,n){const s=t*o,i=e*r;return n?[[s,i+r],[s+o*2,i+r],[s+o,i]]:[[s,i],[s+o*2,i],[s+o,i+r]]}function ye(e,t,o,r){const n=(e+t)%2===0,s=[];return t>0&&s.push([e,t-1]),t<r-1&&s.push([e,t+1]),n?e<o-1&&s.push([e+1,t]):e>0&&s.push([e-1,t]),s}function te(e,t,o){return e*o+t}function be(e,t){const o=new Array(e*t);for(let r=0;r<e;r++)for(let n=0;n<t;n++){const s=te(r,n,t);o[s]=ye(r,n,e,t).map(([i,l])=>te(i,l,t))}return o}const V=32,oe=new Array(V);for(let e=0;e<V;e++){const t=e/(V-1)*.3;oe[e]=`rgba(0,0,0,${t.toFixed(4)})`}function ne(e){const t=Math.min(V-1,Math.max(0,Math.round(e*(V-1))));return oe[t]}function se(e){const t=e.replace("#","");return t.length===3?[parseInt(t[0]+t[0],16),parseInt(t[1]+t[1],16),parseInt(t[2]+t[2],16)]:[parseInt(t.slice(0,2),16),parseInt(t.slice(2,4),16),parseInt(t.slice(4,6),16)]}function ae(e,t,o){return"#"+[e,t,o].map(r=>Math.max(0,Math.min(255,Math.round(r))).toString(16).padStart(2,"0")).join("")}function ie(e,t,o,r){if(r>=0)return[e+(255-e)*r,t+(255-t)*r,o+(255-o)*r];const n=1+r;return[e*n,t*n,o*n]}function Ce(e){let t=Math.imul(e>>>0,2654435769)>>>0;return t^=t>>>16,t=Math.imul(t,2246822507)>>>0,t^=t>>>13,t=Math.imul(t,3266489909)>>>0,t^=t>>>16,(t>>>0)/4294967295*.16-.08}function Q(e,t){if(t<0||!e.startsWith("#"))return e;const[o,r,n]=se(e),s=Ce(t),[i,l,a]=ie(o,r,n,s);return ae(i,l,a)}function Pe(e){if(!e.startsWith("#"))return e;const[t,o,r]=se(e),[n,s,i]=ie(t,o,r,-.09);return ae(n,s,i)}function Se(){const t=document.createElement("canvas");t.width=256,t.height=256;const o=t.getContext("2d");for(let n=0;n<6e3;n++){const s=Math.random()*256,i=Math.random()*256,l=.06+Math.random()*.18,a=Math.random()>.4;o.fillStyle=a?`rgba(255,255,255,${l})`:`rgba(0,0,0,${l*.6})`,o.fillRect(s,i,1,1)}const r=[0,Math.PI/6,-Math.PI/6];for(const n of r){const s=Math.cos(n),i=Math.sin(n),l=n===0?80:55;for(let a=0;a<l;a++){const c=Math.random()*256,p=Math.random()*256,d=256*(.15+Math.random()*.4),C=.04+Math.random()*.08;o.strokeStyle=`rgba(255,255,255,${C})`,o.lineWidth=.3+Math.random()*.5,o.beginPath(),o.moveTo(c,p);const S=(Math.random()-.5)*1.5;o.lineTo(c+s*d-i*S,p+i*d+s*S),o.stroke()}}return t}function we(e){let t=null;try{const n=Se();t=e.createPattern(n,"repeat")}catch{}function o(n){e.beginPath(),e.moveTo(n[0][0],n[0][1]),e.lineTo(n[1][0],n[1][1]),e.lineTo(n[2][0],n[2][1]),e.closePath()}function r(n,s){t&&(e.save(),e.globalCompositeOperation="overlay",e.fillStyle=t,e.fill(),e.restore());const i=s?Pe(s):"rgba(0,0,0,0.09)";e.strokeStyle=i,e.lineWidth=.7,e.stroke()}return{ctx:e,clear(n){n?(e.fillStyle=n,e.fillRect(0,0,e.canvas.width,e.canvas.height)):e.clearRect(0,0,e.canvas.width,e.canvas.height)},drawTriangle(n,s,i=-1){const l=Q(s,i);o(n),e.fillStyle=l,e.fill(),r(n,l)},drawFoldingTriangle(n,s,i,l,a,c=-1){const p=Q(s,c),d=Q(i,c),C=a,S=(a+1)%3,u=(a+2)%3,g=n[C],y=n[S],x=n[u],N=y[0]-g[0],b=y[1]-g[1],D=N*N+b*b,v=D>0?((x[0]-g[0])*N+(x[1]-g[1])*b)/D:0,T=g[0]+v*N,P=g[1]+v*b,F=2*T-x[0],A=2*P-x[1],R=Math.min(1.05,Math.max(0,l));if(R<=.5){const I=R*2,M=1-I,z=T+(x[0]-T)*M,k=P+(x[1]-P)*M;o(n),e.fillStyle=d,e.fill(),r(n,d),M>.005&&(e.beginPath(),e.moveTo(g[0],g[1]),e.lineTo(y[0],y[1]),e.lineTo(z,k),e.closePath(),e.fillStyle=p,e.fill(),e.fillStyle=ne(I*.85),e.fill(),r([g,y,[z,k]],p))}else{const I=(R-.5)*2,M=Math.min(1.1,I),z=T+(F-T)*M,k=P+(A-P)*M;o(n),e.fillStyle=d,e.fill(),r(n,d),M<1&&(e.beginPath(),e.moveTo(g[0],g[1]),e.lineTo(y[0],y[1]),e.lineTo(z,k),e.closePath(),e.fillStyle=d,e.fill(),e.fillStyle=ne((1-M)*.5),e.fill(),r([g,y,[z,k]],d))}},renderFrame(n,s,i,l){this.clear(l),e.save(),e.beginPath(),e.rect(0,0,e.canvas.clientWidth||e.canvas.width,e.canvas.clientHeight||e.canvas.height),e.clip();for(let a=0;a<n.length;a++){const c=n[a],p=i?i[a]:null;p&&p.progress>0&&p.progress<1.15?this.drawFoldingTriangle(c.points,p.oldColor,p.newColor,p.progress,p.foldEdgeIdx,a):this.drawTriangle(c.points,s[a],a)}e.restore()}}}const le={sakura:["#f8c3cd","#f7a1b0","#e87e94","#d4a5a5","#f0e0d6","#fff5ee"],ocean:["#0d3b66","#1a6b8a","#2a9d8f","#40bfa0","#a8dadc","#caf0f8"],ember:["#d35400","#e67e22","#f39c12","#c0392b","#7f2b0a","#2c2c2c"]},_=Object.keys(le);function Te(e=0){let t=e%_.length,o=0;return{currentPaletteName(){return _[t]},currentPalette(){return le[_[t]]},currentColor(){const r=this.currentPalette();return r[o%r.length]},nextColor(){const r=this.currentPalette();return o++,o>=r.length&&(o=0,t=(t+1)%_.length),this.currentColor()},nextPalette(){t=(t+1)%_.length,o=0},setPaletteByIndex(r){t=(r%_.length+_.length)%_.length,o=0},currentPaletteIndex(){return t},randomColorExcluding(r){const n=this.currentPalette(),s=n.filter(i=>i!==r);return s.length===0?n[0]:s[Math.floor(Math.random()*s.length)]}}}function Ie(e){return e<.5?4*e*e*e:1-Math.pow(-2*e+2,3)/2}function Ee(e,t=4e3,o=.3){if(e.length===0)return[];const r=e[e.length-1].distance;if(r===0)return e.map(({index:i,parentIdx:l})=>({index:i,startTime:0,parentIdx:l}));const s=t/r*o;return e.map(({index:i,distance:l,parentIdx:a})=>{const c=l/r,d=Ie(c)*t,C=l>0?Math.random()*s:0;return{index:i,startTime:d+C,parentIdx:a}})}function Me(e){if(e<=0)return 0;if(e>=1)return 1;const t=1,o=e-1;return 1+o*o*((t+1)*o+t)}const W={IDLE:"IDLE",FOLDING:"FOLDING",DONE:"DONE"};function ve(){return{state:W.IDLE,progress:0,startTime:0,duration:350,oldColor:null,newColor:null,foldEdgeIdx:0}}function Ae(e,t,o,r,n,s=600){e.state=W.FOLDING,e.progress=0,e.startTime=t,e.duration=Math.max(400,s),e.oldColor=r,e.newColor=o,e.foldEdgeIdx=n}function Le(e,t){if(e.state!==W.FOLDING)return!1;const o=t-e.startTime;if(o>=e.duration)return e.progress=1,e.state=W.DONE,!0;const r=o/e.duration;return e.progress=Me(r),!1}function Ne(e){e.state=W.IDLE,e.progress=0,e.oldColor=null,e.newColor=null}function De(e){return Array.from({length:e},()=>ve())}function ke(e,t,o,r=55){const{cx:n,cy:s,points:i}=e,l=n<r,a=n>t-r,c=s<r,p=s>o-r;if(!l&&!a&&!c&&!p)return-1;const d=[[i[0],i[1]],[i[1],i[2]],[i[2],i[0]]];let C=0,S=1/0;for(let u=0;u<3;u++){const g=(d[u][0][0]+d[u][1][0])/2,y=(d[u][0][1]+d[u][1][1])/2,x=Math.min(g,t-g,y,o-y);x<S&&(S=x,C=u)}return C}function Oe(e,t){const o=t.col-e.col;return o===-1?2:o===1?1:0}function Fe(e,t){const o=t.length,r=new Uint8Array(o),n=[],s=[{index:e,distance:0,parentIdx:-1}];r[e]=1;let i=0;for(;i<s.length;){const l=s[i++];n.push(l);for(const a of t[l.index])r[a]||(r[a]=1,s.push({index:a,distance:l.distance+1,parentIdx:l.index}))}return n}function _e(e,t,o=60){const r=Fe(e,t),s=(r.length>0?r[r.length-1].distance:0)*o;return Ee(r,s,.35)}const Re=8e3,ze=600,qe=60,We=2;function je(e,t,o=1e3){const r=e*t,n=Math.sqrt(r*Math.sqrt(3)/(4*o));return Math.max(40,Math.min(100,Math.round(n)))}function He(e,t={}){const o=t.side||0,r=t.density??1e3,n=t.cascadeDelay??qe,s=t.paletteIdx??0;let i=t.foldDuration??ze,l=t.waitTime??Re,a=o,c=t.maxConcurrent??We,p=e.getContext("2d"),d,C,S,u,g,y,x=Te(s),N=x.currentColor(),b=[],D=0,v=null,T=!1,P=!0,F=0,A=0,R="",I=[],M=0;function z(f){if(I.push(f),I.length>60&&I.shift(),I.length>=2){const E=I[I.length-1]-I[0];M=Math.round((I.length-1)/(E/1e3))}}function k(){const f=window.devicePixelRatio||1;e.width=e.clientWidth*f,e.height=e.clientHeight*f,p.setTransform(f,0,0,f,0,0);const E=a||je(e.clientWidth,e.clientHeight,r);d=me(e.clientWidth,e.clientHeight,E),C=be(d.rows,d.cols),S=we(p),u=De(d.triangles.length),g=new Array(d.triangles.length).fill(N),y=new Array(d.triangles.length).fill(null),b=[]}function m(f,E){if(b.length>=c)return;const h=E||x.nextColor(),w=Math.floor(Math.random()*d.triangles.length),L=_e(w,C,n),B=e.clientWidth,K=e.clientHeight;for(const q of L){const J=u[q.index];if(J.state===W.FOLDING)continue;const ee=d.triangles[q.index];let Z=ke(ee,B,K);if(Z===-1&&(Z=0,q.parentIdx>=0)){const he=d.triangles[q.parentIdx];Z=Oe(ee,he)}Ae(J,f+q.startTime,h,g[q.index],Z,i)}P=!0,b.push({schedule:L,startTime:f,newColor:h}),N=h}function $(f){const E=Math.min(1,A/400);p.save(),p.globalAlpha=E*.85,p.fillStyle="rgba(0,0,0,0.5)",p.font="bold 18px system-ui, sans-serif";const L=p.measureText(f).width+16*2,B=36,K=(e.clientWidth-L)/2,q=e.clientHeight-60;p.beginPath(),p.roundRect(K,q,L,B,8),p.fill(),p.fillStyle="#fff",p.textAlign="center",p.textBaseline="middle",p.fillText(f,e.clientWidth/2,q+B/2),p.restore()}function U(f){if(!T)return;if(z(f),b=b.filter(h=>{const w=h.schedule.reduce((L,B)=>Math.max(L,B.startTime),0);return f<h.startTime+w+i+50}),b.length<c&&f>=D){m(f);const h=b.length>=c?l*.5:l;D=f+h}let E=F;F=0;for(let h=0;h<u.length;h++){const w=u[h];w.state===W.FOLDING&&(w.startTime<=f?Le(w,f)?(g[h]=w.newColor,Ne(w),P=!0):(F++,P=!0):F++)}if(E>0&&F===0&&(P=!0),P||A>0){for(let h=0;h<u.length;h++){const w=u[h];if(w.state===W.FOLDING&&w.startTime<=f){y[h]||(y[h]={});const L=y[h];L.progress=w.progress,L.oldColor=w.oldColor,L.newColor=w.newColor,L.foldEdgeIdx=w.foldEdgeIdx}else y[h]=null}S.renderFrame(d.triangles,g,y,N),A>0&&($(R),A-=16),P=!1}v=requestAnimationFrame(U)}function Y(f,E){switch(f){case"speed":i=Math.round(600/Math.max(.1,E));break;case"waitTime":l=E;break;case"side":if(a=E,T&&d){const h=N;k(),g.fill(h),D=performance.now()+1500}break;case"maxConcurrent":c=E;break;case"paletteIdx":if(x.setPaletteByIndex(E),R=`Palette: ${x.currentPaletteName()}`,A=2e3,P=!0,T&&d){const h=performance.now();b.length>=c&&b.shift(),m(h,x.currentColor()),D=h+l}break}}function fe(f){switch(f){case"speed":return Math.round(600/i*100)/100;case"waitTime":return l;case"side":return a;case"maxConcurrent":return c;case"paletteIdx":return x.currentPaletteIndex();default:return}}return{start(){T=!0,k(),D=performance.now()+2e3,v=requestAnimationFrame(U)},stop(){T=!1,v!=null&&(cancelAnimationFrame(v),v=null)},resize(){if(!T)return;const f=N;k(),g.fill(f),b=[],F=0,P=!0,D=performance.now()+2e3},switchPalette(){if(x.nextPalette(),R=`Palette: ${x.currentPaletteName()}`,A=2500,P=!0,T&&d){const f=performance.now();b.length>=c&&b.shift(),m(f,x.currentColor()),D=f+l}},setParam:Y,getParam:fe,getFPS:()=>M,getPaletteIdx:()=>x.currentPaletteIndex()}}function Be(e){let t;e instanceof URLSearchParams?t=e:typeof window<"u"?t=new URLSearchParams(window.location.search):t=new URLSearchParams("");let o=0;const r=t.get("palette");if(r){const u=_.indexOf(r.toLowerCase());u!==-1&&(o=u)}let n=400;const s=t.get("speed");if(s!==null){const u=parseFloat(s);if(!isNaN(u)&&u>0){const g=Math.max(.25,Math.min(4,u));n=Math.round(400/g)}}let i=0;const l=t.get("size");if(l!==null){const u=parseInt(l,10);!isNaN(u)&&u>0&&(i=Math.max(20,Math.min(200,u)))}let a=500;const c=t.get("density");if(c!==null){const u=parseInt(c,10);!isNaN(u)&&u>0&&(a=Math.max(100,Math.min(5e3,u)))}let p=2;const d=t.get("cascades");if(d!==null){const u=parseInt(d,10);!isNaN(u)&&u>0&&(p=Math.max(1,Math.min(5,u)))}let C=8e3;const S=t.get("wait");if(S!==null){const u=parseInt(S,10);!isNaN(u)&&u>0&&(C=Math.max(500,Math.min(3e4,u)))}return{paletteIdx:o,foldDuration:n,side:i,density:a,maxConcurrent:p,waitTime:C}}const $e=`
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 9999;
  background: rgba(15, 15, 20, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 12px;
  padding: 20px 22px 18px;
  min-width: 280px;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  color: #e8e8e8;
  user-select: none;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
`,Ge=`
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.45);
  margin: 0 0 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`,Ve=`
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #7cf582;
  background: rgba(124,245,130,0.1);
  border-radius: 4px;
  padding: 1px 7px;
`,ce=`
  margin-bottom: 14px;
`,de=`
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
  font-size: 12px;
  color: rgba(255,255,255,0.7);
`,Ue=`
  width: 100%;
  height: 4px;
  appearance: none;
  -webkit-appearance: none;
  background: rgba(255,255,255,0.18);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
`,Ze=`
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.08);
  font-size: 11px;
  color: rgba(255,255,255,0.3);
  text-align: center;
  letter-spacing: 0.04em;
`,Xe=`
  display: flex;
  gap: 8px;
  margin-top: 4px;
`,ue=`
  flex: 1;
  padding: 5px 0;
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 6px;
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.7);
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
`,pe=`
  flex: 1;
  padding: 5px 0;
  border: 1px solid rgba(255,255,255,0.5);
  border-radius: 6px;
  background: rgba(255,255,255,0.16);
  color: #fff;
  font-size: 11px;
  cursor: pointer;
  font-weight: 600;
`;let re=!1;function Ye(){if(re)return;re=!0;const e=document.createElement("style");e.textContent=`
    .oc-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #fff;
      cursor: pointer;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    }
    .oc-slider::-moz-range-thumb {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #fff;
      cursor: pointer;
      border: none;
    }
  `,document.head.appendChild(e)}function X(e,t,o,r,n,s,i=""){const l=document.createElement("div");l.style.cssText=ce;const a=document.createElement("div");a.style.cssText=de,a.innerHTML=`<span>${e}</span><span id="${t}-val">${s}${i}</span>`;const c=document.createElement("input");return c.type="range",c.min=String(o),c.max=String(r),c.step=String(n),c.value=String(s),c.style.cssText=Ue,c.className="oc-slider",c.id=t,l.appendChild(a),l.appendChild(c),l}function Ke(e,t,o){const r=document.createElement("div");r.style.cssText=ce;const n=document.createElement("div");n.style.cssText=de,n.innerHTML="<span>Palette</span>",r.appendChild(n);const s=document.createElement("div");return s.style.cssText=Xe,s.id="oc-palette-btns",e.forEach((i,l)=>{const a=document.createElement("button");a.textContent=i,a.style.cssText=l===t?pe:ue,a.dataset.idx=String(l),a.addEventListener("click",()=>o(l)),s.appendChild(a)}),r.appendChild(s),r}function Qe(e,t={}){if(typeof document>"u")return null;Ye();const o=t.palettes||["Sakura","Ocean","Ember"];let r=t.paletteIdx??0;const n=e.getParam("speed")??1,s=e.getParam("waitTime")??8e3,i=e.getParam("side")??0,l=e.getParam("maxConcurrent")??2,a=document.createElement("div");a.style.cssText=$e,a.id="oc-controls";const c=document.createElement("div");c.style.cssText=Ge,c.innerHTML=`<span>Controls</span><span id="oc-fps" style="${Ve}">— fps</span>`,a.appendChild(c);const p=X("Fold Speed","oc-speed",.25,4,.25,n,"×");a.appendChild(p);const d=Math.round(s/1e3),C=X("Wave Pause","oc-wait",2,30,1,d,"s");a.appendChild(C);const S=X("Triangle Size","oc-size",20,200,5,i,"px");a.appendChild(S);const u=X("Cascades","oc-cascades",1,5,1,l,"");a.appendChild(u);const g=Ke(o,r,m=>{m!==r&&(r=m,e.setParam("paletteIdx",m),M(m))});a.appendChild(g);const y=document.createElement("div");y.style.cssText=Ze,y.textContent="C to close  ·  P to cycle palette  ·  ± speed",a.appendChild(y);const x=a.querySelector("#oc-speed"),N=a.querySelector("#oc-speed-val");x.addEventListener("input",()=>{const m=parseFloat(x.value);N.textContent=m+"×",e.setParam("speed",m)});const b=a.querySelector("#oc-wait"),D=a.querySelector("#oc-wait-val");b.addEventListener("input",()=>{const m=parseInt(b.value,10);D.textContent=m+"s",e.setParam("waitTime",m*1e3)});const v=a.querySelector("#oc-size"),T=a.querySelector("#oc-size-val");v.addEventListener("input",()=>{T.textContent=v.value+"px"}),v.addEventListener("change",()=>{const m=parseInt(v.value,10);e.setParam("side",m)});const P=a.querySelector("#oc-cascades"),F=a.querySelector("#oc-cascades-val");P.addEventListener("input",()=>{const m=parseInt(P.value,10);F.textContent=String(m),e.setParam("maxConcurrent",m)});let A=!1;a.style.display="none",document.body.appendChild(a);function R(){A=!A,a.style.display=A?"block":"none"}function I(m){const $=a.querySelector("#oc-fps");$&&($.textContent=m+" fps")}function M(m){a.querySelectorAll("#oc-palette-btns button").forEach((U,Y)=>{U.style.cssText=Y===m?pe:ue})}function z(m){r=m,M(m)}function k(){a.parentNode&&a.parentNode.removeChild(a)}return{toggle:R,setFPS:I,syncPaletteIdx:z,destroy:k,isVisible:()=>A}}const j=Be(),Je=document.getElementById("canvas"),O=He(Je,{paletteIdx:j.paletteIdx,foldDuration:j.foldDuration,side:j.side,density:j.density,maxConcurrent:j.maxConcurrent,waitTime:j.waitTime});O.start();window.addEventListener("resize",()=>O.resize());const H=Qe(O,{palettes:_.map(e=>e.charAt(0).toUpperCase()+e.slice(1)),paletteIdx:j.paletteIdx});H&&setInterval(()=>{H.setFPS(O.getFPS()),H.syncPaletteIdx(O.getPaletteIdx())},1e3);const G=[.25,.5,.75,1,1.25,1.5,2,2.5,3,4];window.addEventListener("keydown",e=>{switch(e.key){case"p":case"P":O.switchPalette(),H&&H.syncPaletteIdx(O.getPaletteIdx());break;case"c":case"C":H&&H.toggle();break;case"+":case"=":{const t=O.getParam("speed")??1,o=G.find(r=>r>t+.01)??G[G.length-1];O.setParam("speed",o);break}case"-":case"_":{const t=O.getParam("speed")??1,o=[...G].reverse().find(r=>r<t-.01)??G[0];O.setParam("speed",o);break}}});
