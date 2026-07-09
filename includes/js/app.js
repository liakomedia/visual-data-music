/* Visual Data Music — GRAPH LOGIC (depends on globals from data.js: DATA, TYPES, CAT) */
/* Swallow a benign internal error thrown by the 3d-force-graph bundle during pointer
   handling (harmless — our own capture-phase handler does the click centering). */
window.addEventListener('error',function(e){
  if(e.filename && e.filename.indexOf('3d-force-graph')>-1){ e.preventDefault(); return true; }
},true);

/* =====================  FLATTEN TREE → nodes + links  ===================== */
let NODES=[], LINKS=[], byId={};
let uid=0;
function walk(n,parent,type,depth){
  if(n.skip) return;
  const t = n.root?"root": (n.type? n.type : type);
  const id = "n"+(uid++);
  const hasKids = !!(n.children&&n.children.length);
  // leaf0 = a former end-bubble now holding ~10 example children; its children are 'item's
  const kind = n.root?"root": depth===1?"cat": (parent&&parent.leaf0)?"item"
             : n.leaf0?"leaf" : hasKids?(depth===2?"group":"sub"):"leaf";
  const node={
    id, name:n.name, sub:n.sub||"", depth,
    kind, type:t, meta:n.meta||null, leaf0:!!n.leaf0,
    v:n.v||(n.root?60:kind==='cat'?26:kind==='group'?13:kind==='item'?3.4:kind==='leaf'?5.4:7),
    parent: parent?parent.id:null, childIds:[], collapsed:true
  };
  byId[id]=node; NODES.push(node);
  if(parent){ LINKS.push({source:parent.id,target:id}); parent.childIds.push(id); }
  (n.children||[]).forEach(c=>walk(c,node,t,depth+1));
  return node;
}
const ROOT=walk(DATA,null,null,0);
ROOT.collapsed=false;            // MUSIC expanded → the domains are visible
ROOT.fx=ROOT.fy=ROOT.fz=0;       // pin MUSIC at the centre so it stays the fixed heart of the map
let ENTRIES=0, EXAMPLES=0;
NODES.forEach(n=>{ if(n.leaf0) ENTRIES++; else if(n.kind==='item') EXAMPLES++; });

/* deepest currently-visible node on a node's ancestor chain (itself if visible) */
function nearestVisible(n){ let c=n; while(c && !visible(c)) c=byId[c.parent]; return c; }
/* visibility: node visible if parent expanded and parent visible */
function visible(node){
  if(!node.parent) return true;
  const p=byId[node.parent];
  return !p.collapsed && visible(p);
}
function currentData(){
  const ns=NODES.filter(visible);
  const ok=new Set(ns.map(n=>n.id));
  const ls=LINKS.filter(l=>{
    const s=typeof l.source==='object'?l.source.id:l.source;
    const t=typeof l.target==='object'?l.target.id:l.target;
    return ok.has(s)&&ok.has(t);
  });
  return {nodes:ns,links:ls};
}

const hiddenTypes=new Set(), _legendChips=[];
function refreshLegendChips(){ _legendChips.forEach(c=>c.el.classList.toggle('off',!c.isOn())); }
function applyTypeVisibility(){
  Graph.nodeVisibility(Graph.nodeVisibility()); Graph.linkVisibility(Graph.linkVisibility()); }
function mkToggle(el, html, isOn, onToggle){
  const s=document.createElement('span'); s.className='lg tgl'+(isOn()?'':' off'); s.innerHTML=html;
  s.title='Click to show / hide';
  s.onclick=()=>{ onToggle(); s.classList.toggle('off', !isOn()); _syncLegendMaster(); };
  el.appendChild(s); _legendChips.push({el:s,isOn,toggle:onToggle}); return s;
}
/* master tick box: one click selects / unselects every domain; shows a dash when mixed */
function _syncLegendMaster(){ const cb=document.getElementById('legend-all'); if(!cb) return;
  const on=_legendChips.filter(c=>c.isOn()).length;
  cb.checked = on===_legendChips.length; cb.indeterminate = on>0 && on<_legendChips.length; }

/* nearest ancestor (or self) of a given kind — used to find a node's home domain */
function ancestorKind(n,kind){ let c=n; while(c){ if(c.kind===kind) return c; c=c.parent?byId[c.parent]:null; } return null; }

/* =====================  BUILD 3D GRAPH  ===================== */
const elGraph=document.getElementById('graph');
let Graph, _dl=null, _deg={}, hoverNode=null;
let showAll=true;    // "Show all" mode (default): every bubble stays visible; clicking only glides the camera
function boot(){
  if(typeof ForceGraph3D==='undefined'){ setTimeout(boot,120); return; }
  document.getElementById('loading').classList.add('done');
  if(showAll) setEverything(true);   // default: reveal all bubbles from the start
  Graph = ForceGraph3D({controlType:'orbit'})(elGraph)
   .enableNodeDrag(false)
   .backgroundColor('#05070e')
   .nodeRelSize(4)
   .nodeVal(n=> n.v)
   .nodeColor(n=> (TYPES[n.type]||TYPES.root).c)
   .nodeOpacity(1)
   .nodeResolution(24)
   .nodeLabel(n=> n.name)
   .linkColor(l=>{ const t=(typeof l.target==='object'?l.target:byId[l.target]); return (TYPES[t.type]||TYPES.root).c; })
   .linkOpacity(0.32)
   .linkWidth(0.7)
   .linkDirectionalArrowLength(3.0)
   .linkDirectionalArrowRelPos(1)
   .linkDirectionalParticles(2)
   .linkDirectionalParticleSpeed(0.006)
   .linkDirectionalParticleWidth(1.2)
   .linkDirectionalParticleColor('#cfe0ff')
   .onNodeHover(n=>{ hoverNode=n; elGraph.style.cursor = n?'pointer':'grab'; if(n) showPanel(n); })
   .nodeVisibility(n=> !hiddenTypes.has(n.type))
   .linkVisibility(l=>{ const a=typeof l.source==='object'?l.source:byId[l.source], b=typeof l.target==='object'?l.target:byId[l.target];
     return !(a&&hiddenTypes.has(a.type)) && !(b&&hiddenTypes.has(b.type)); })
   .onBackgroundClick(()=>{ })
   .graphData(currentData());

  Graph.d3Force('charge').strength(-88).distanceMax(700);
  Graph.d3Force('link')
    .distance(l=>{ const t=(typeof l.target==='object'?l.target:byId[l.target]);
      return t.kind==='cat'?62 : t.kind==='group'?44 : t.kind==='sub'?28 : 19; })
    .strength((l,i,links)=>{
      if(links!==_dl){ _dl=links; _deg={};
        links.forEach(k=>{ const s=k.source.id||k.source, t=k.target.id||k.target;
          _deg[s]=(_deg[s]||0)+1; _deg[t]=(_deg[t]||0)+1; }); }
      const s=l.source.id||l.source, t=l.target.id||l.target;
      return 1/Math.min(_deg[s]||1,_deg[t]||1);
    });
  Graph.cameraPosition({x:0,y:0,z: showAll?320:270});
  buildLegend(); updateCrumbs(ROOT); updateHud(); syncLabels();
}
function refresh(){ Graph.graphData(currentData()); updateHud(); syncLabels(); }

/* ===== ALWAYS-ON LABELS as HTML overlays projected onto each bubble ===== */
const labelLayer=document.createElement('div');
labelLayer.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:5;overflow:hidden';
document.body.appendChild(labelLayer);
const labelEls={};
function syncLabels(){
  const ok=new Set(currentData().nodes.map(n=>n.id));
  Object.keys(labelEls).forEach(id=>{ if(!ok.has(id)){ labelEls[id].remove(); delete labelEls[id]; }});
  ok.forEach(id=>{
    if(labelEls[id]) return;
    const n=byId[id], col=(TYPES[n.type]||TYPES.root).c;
    const fs = n.kind==='root'?15:n.kind==='cat'?13:n.kind==='group'?12:n.kind==='sub'?11:n.kind==='leaf'?10:9;
    const el=document.createElement('div');
    el.textContent=n.name;
    el.style.cssText=`position:absolute;left:0;top:0;opacity:0;transform:translate(-9999px,-9999px);`+
      `font:600 ${fs}px 'Space Grotesk',system-ui,sans-serif;letter-spacing:.01em;color:#eaf0ff;white-space:nowrap;padding:2px 7px;`+
      `border-radius:6px;background:rgba(6,9,18,.62);border:1px solid ${col}55;box-shadow:0 0 0 1px rgba(0,0,0,.25),0 4px 12px rgba(0,0,0,.35);`+
      `backdrop-filter:blur(3px);text-shadow:0 1px 3px #000;will-change:transform`;
    labelLayer.appendChild(el); labelEls[id]=el;
  });
}
function tickLabels(){
  requestAnimationFrame(tickLabels);
  if(!Graph||!Graph.graph2ScreenCoords) return;
  const W2=elGraph.clientWidth, H2=elGraph.clientHeight;
  const SMALL = window.innerWidth<640;
  const MAX = SMALL?14:56;
  let cam; try{ cam=Graph.cameraPosition(); }catch(e){ cam=null; }
  const cand=[];
  for(const id in labelEls){
    const n=byId[id], el=labelEls[id];
    if(n.x==null){ el.style.opacity=0; continue; }
    if(hiddenTypes.has(n.type)){ el.style.opacity=0; continue; }
    let c; try{ c=Graph.graph2ScreenCoords(n.x,n.y,n.z); }catch(e){ el.style.opacity=0; continue; }
    if(!c||isNaN(c.x)||c.x<-60||c.y<-30||c.x>W2+60||c.y>H2+30){ el.style.opacity=0; continue; }
    const cd = cam? Math.hypot(n.x-cam.x,n.y-cam.y,n.z-cam.z) : 0;
    cand.push({n,el,c, pri: n.v*8 - cd});
  }
  cand.sort((a,b)=>b.pri-a.pri);
  const placed=[]; let shown=0;
  cand.forEach(o=>{
    if(shown>=MAX || placed.some(q=>Math.abs(q.x-o.c.x)<74 && Math.abs(q.y-o.c.y)<17)){ o.el.style.opacity=0; return; }
    placed.push(o.c); shown++;
    o.el.style.opacity=0.96;
    o.el.style.transform=`translate(-50%,-150%) translate(${o.c.x}px,${o.c.y}px)`;
  });
}
requestAnimationFrame(tickLabels);

/* start the graph now that the label overlay system is defined */
boot();

/* Reliable single-click / single-tap centering (library's own is flaky here). */
let _downXY=null;
elGraph.addEventListener('pointerdown',e=>{ _downXY=[e.clientX,e.clientY]; },true);
elGraph.addEventListener('pointerup',e=>{
  if(!_downXY) return;
  const moved=Math.hypot(e.clientX-_downXY[0], e.clientY-_downXY[1]); _downXY=null;
  if(moved<6 && hoverNode) onClick(hoverNode);
},true);

function onClick(n){
  showPanel(n);
  updateCrumbs(n);
  // in show-all mode only the drill-down (leaf0) bubbles are click-to-open; other bubbles just glide.
  if(n.childIds.length && (!showAll || n.leaf0)){
    n.collapsed=!n.collapsed;
    if(n.collapsed){ collapseDesc(n); }
    else {
      n.childIds.forEach(id=>{const c=byId[id];
        c.x=(n.x||0)+(Math.random()-.5)*24; c.y=(n.y||0)+(Math.random()-.5)*24; c.z=(n.z||0)+(Math.random()-.5)*24; c.vx=c.vy=c.vz=0;});
    }
    refresh();
    updateCrumbs(n);
    if(Graph.d3ReheatSimulation) Graph.d3ReheatSimulation();
  }
  focusOn(n);
}
function focusOn(n){
  if(showAll){ focusNode(n); return; }
  const set=new Set([n.id]); n.childIds.forEach(id=>set.add(id));
  if(n.parent) set.add(n.parent);
  const delay = (n.childIds.length && !n.collapsed)?650:280;
  setTimeout(()=>{ try{ Graph.zoomToFit(950,70,nd=> set.has(nd.id)); }catch(e){} }, delay);
}
function focusNode(n){
  if(n.x==null) return;
  const dist = 66 + (n.v||5)*2.2;
  const r = Math.hypot(n.x||0,n.y||0,n.z||0);
  const pos = r<1 ? {x:n.x||0,y:n.y||0,z:(n.z||0)+dist}
                  : (k=>({x:n.x*k,y:n.y*k,z:n.z*k}))(1+dist/r);
  try{ Graph.cameraPosition(pos, {x:n.x,y:n.y,z:n.z}, 900); }catch(e){}
}
function collapseDesc(n){ n.childIds.forEach(id=>{const c=byId[id];c.collapsed=true;collapseDesc(c);}); }

/* =====================  DETAIL PANEL  ===================== */
const panel=document.getElementById('panel'), pph=document.getElementById('pph'), pbd=document.getElementById('pbd');
document.getElementById('pclose').onclick=()=>panel.classList.remove('open');
function showPanel(n){
  const catAnc = ancestorKind(n,'cat');
  const catT = catAnc?catAnc.type:n.type;
  const col=(TYPES[catT]||TYPES.root).c;
  pph.style.display='none';
  const kindLabel =
    n.kind==='root'?'The whole world of music' :
    n.kind==='cat'?'Domain' :
    n.kind==='item'?'Example' :
    n.kind==='leaf'?'Entry' : 'Area';
  const domainLabel = (TYPES[catT]||TYPES.root).label;

  const info=Object.assign({}, n.meta||{});
  let h=`<span class="tag" style="background:${col}">${domainLabel}${n.kind!=='cat'&&n.kind!=='root'?` · ${kindLabel}`:''}</span>`;
  h+=`<h2>${n.name}</h2>`;
  if(n.sub) h+=`<div class="years">${n.sub}</div>`;
  if(info.era||info.region){
    const line=[info.region,info.era].filter(Boolean).join(' · ');
    h+=`<div class="years">${line}</div>`;
  }
  const order=[['def','What it is'],['aka','Also called'],['ex','Examples'],
    ['who','The role'],['money','How the money works']];
  let rows='';
  order.forEach(([k,l])=>{ if(info[k]) rows+=row(l,info[k]); });
  if(rows) h+=`<div class="rows">${rows}</div>`;
  if(info.note) h+=`<div class="note">${info.note}</div>`;
  if(n.leaf0){ const opened=!n.collapsed;
    h+=`<div style="margin-top:11px;font-size:11.5px;color:${col};font-family:var(--mono);letter-spacing:.02em">`+
       `▸ ${n.childIds.length} examples ${opened?'shown on the map':'— click this bubble to reveal them'}</div>`; }

  // where in the map this sits — the trail of parents
  const path=[]; let c=n.parent?byId[n.parent]:null;
  while(c){ path.unshift(c); c=c.parent?byId[c.parent]:null; }
  if(path.length){
    h+=`<div style="margin-top:14px;padding-top:8px;border-top:1px solid ${col}55;font-size:9.5px;`+
       `letter-spacing:.14em;text-transform:uppercase;color:${col}">◆ Where it sits</div>`;
    h+=`<div style="margin-top:6px;font-size:12px;color:#c6d2f2;line-height:1.6">`+
       path.map(p=>p.name).join(' <span style="opacity:.5">›</span> ')+`</div>`;
  }
  pbd.innerHTML=h; panel.classList.add('open');
}
function row(l,v){return `<div class="row"><div class="lab">${l}</div><div class="val">${v}</div></div>`;}

/* =====================  BREADCRUMBS  ===================== */
/* seed a node's hidden children right beside it so they emerge in place, not from the origin */
function seedKids(p){ p.childIds.forEach(id=>{const c=byId[id];
  if(c.x==null){ c.x=(p.x||0)+(Math.random()-.5)*24; c.y=(p.y||0)+(Math.random()-.5)*24; c.z=(p.z||0)+(Math.random()-.5)*24; c.vx=c.vy=c.vz=0; }}); }
/* open a target and all its ancestors (works in any mode) — used by search & crumb navigation */
function revealChain(target){
  let x=target, chain=[]; while(x){ chain.unshift(x); x=x.parent?byId[x.parent]:null; }
  let changed=false;
  chain.forEach(c=>{ if(c.childIds.length && c.collapsed){ c.collapsed=false; changed=true; } seedKids(c); });
  if(changed){ refresh(); if(Graph.d3ReheatSimulation) Graph.d3ReheatSimulation(); }
  return changed;
}
function goTo(p){
  if(!showAll){
    let x=p; const keep=new Set(); while(x){keep.add(x.id);x=x.parent?byId[x.parent]:null;}
    NODES.forEach(nd=>{ nd.collapsed = !keep.has(nd.id) ? true : false; });
    p.collapsed=false;
    seedKids(p);
    refresh();
    if(Graph.d3ReheatSimulation) Graph.d3ReheatSimulation();
  }
  else if(p.leaf0 && p.collapsed){ revealChain(p); }   // show-all: open a drill-down bubble's examples
  updateCrumbs(p); showPanel(p);
  focusOn(p);
}
function updateCrumbs(n){
  const path=[]; let c=n; while(c){path.unshift(c);c=c.parent?byId[c.parent]:null;}
  const el=document.getElementById('crumbs'); el.innerHTML='';
  path.forEach((p,i)=>{
    const s=document.createElement('span');
    s.className='crumb'+(i===path.length-1?' active':'');
    s.textContent = i===0?'◎ MUSIC':p.name;
    s.onclick=()=>goTo(p);
    el.appendChild(s);
  });
  if(n.childIds && n.childIds.length){
    const sep=document.createElement('span'); sep.className='crumb-sep'; sep.textContent='▸';
    el.appendChild(sep);
    n.childIds.forEach(id=>{
      const cn=byId[id];
      const s=document.createElement('span');
      s.className='crumb child';
      s.style.borderColor=(TYPES[cn.type]||TYPES.root).c;
      s.textContent=cn.name;
      s.onclick=()=>goTo(cn);
      el.appendChild(s);
    });
  }
}

/* =====================  LEGEND / HUD  ===================== */
function buildLegend(){
  const el=document.getElementById('legend');
  el.innerHTML='<b>DOMAINS · click to hide / show</b>';
  el.insertAdjacentHTML('afterbegin',
    '<label class="lg" style="width:100%;cursor:pointer;user-select:none;margin-bottom:2px;color:#eaf0ff">'+
    '<input type="checkbox" id="legend-all" checked style="accent-color:#c084fc;margin:0 7px 0 0;cursor:pointer;vertical-align:-2px">select / unselect all</label>');
  document.getElementById('legend-all').onchange=e=>{ const on=e.target.checked;
    _legendChips.forEach(c=>{ if(c.toggle && c.isOn()!==on) c.toggle(); });
    refreshLegendChips(); _syncLegendMaster(); };
  CAT.forEach(k=>{
    mkToggle(el, `<span class="sw" style="background:${TYPES[k].c}"></span>${TYPES[k].label}`,
      ()=>!hiddenTypes.has(k),
      ()=>{ hiddenTypes.has(k)?hiddenTypes.delete(k):hiddenTypes.add(k); applyTypeVisibility(); });
  });
}
function countLeaves(){return NODES.filter(n=>!n.childIds.length).length;}
function updateHud(){
  const vis=currentData().nodes.length;
  const counts = EXAMPLES>0 ? `${CAT.length} domains · ${ENTRIES} entries · ${EXAMPLES} examples`
                            : `${CAT.length} domains · ${NODES.length} bubbles · ${countLeaves()} entries`;
  const line2 = EXAMPLES>0 ? 'click a bubble to open its examples' : 'drag to orbit · scroll to zoom';
  document.getElementById('hud').innerHTML=`${counts}<br/>${vis} shown · ${line2}`;
}

/* =====================  SEARCH  ===================== */
const q=document.getElementById('q');
q.addEventListener('keydown',e=>{
  if(e.key!=='Enter') return;
  const term=q.value.trim().toLowerCase(); if(!term) return;
  let hit=NODES.find(n=>n.name.toLowerCase()===term) || NODES.find(n=>n.name.toLowerCase().includes(term));
  if(!hit) return;
  revealChain(hit);   // open the path to the hit (incl. its examples if it's a drill-down bubble)
  const t=byId[hit.id];
  showPanel(t); updateCrumbs(t);
  focusOn(t);
});

/* =====================  VIEW CONTROLS  ===================== */
const bAll=document.getElementById('bAll');
if(bAll && showAll){ bAll.classList.add('active'); bAll.textContent='Exit show-all'; }
document.getElementById('bFit').onclick=()=>{ if(Graph) Graph.zoomToFit(800,60); };

/* legend is collapsed by default (like the other Visual Data apps) — the ◈ Legend chip toggles it open */
const legendBtn=document.getElementById('legend-btn'), legendEl=document.getElementById('legend');
if(legendBtn&&legendEl) legendBtn.onclick=()=>{ legendEl.classList.toggle('open'); legendBtn.classList.toggle('open', legendEl.classList.contains('open')); };

function setEverything(expanded){
  // leaf0 (drill-down) bubbles stay collapsed even in show-all, so the ~23k examples
  // only appear when a specific end-bubble is opened — keeps the default view fast.
  NODES.forEach(n=>{ if(n.parent) n.collapsed = n.leaf0 ? true : !expanded; });
  ROOT.collapsed=false;
  if(expanded) NODES.forEach(n=>{ if(n.x===undefined){ const p=byId[n.parent]||{};
    n.x=(p.x||0)+(Math.random()-.5)*30; n.y=(p.y||0)+(Math.random()-.5)*30; n.z=(p.z||0)+(Math.random()-.5)*30; }});
}
if(bAll) bAll.onclick=()=>{
  showAll=!showAll;
  bAll.classList.toggle('active',showAll);
  bAll.textContent = showAll?'Exit show-all':'Show all';
  setEverything(showAll);
  refresh();
  if(Graph.d3ReheatSimulation) Graph.d3ReheatSimulation();
  updateCrumbs(ROOT);
  setTimeout(()=>{ try{ Graph.zoomToFit(1100,60); }catch(e){} }, showAll?1300:500);
};
document.getElementById('bReset').onclick=()=>{
  showAll=true; if(bAll){ bAll.classList.add('active'); bAll.textContent='Exit show-all'; }
  setEverything(true);
  refresh(); updateCrumbs(ROOT); panel.classList.remove('open');
  if(Graph.d3ReheatSimulation) Graph.d3ReheatSimulation();
};
window.addEventListener('resize',()=>{ if(Graph){Graph.width(elGraph.clientWidth).height(elGraph.clientHeight);} });
