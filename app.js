(function(){
  const $=s=>document.querySelector(s);
  const canvas=$('#cvs'), ctx=canvas.getContext('2d');
  let baseImg=null, overlayImg=null, arts=[]; let mockupName=''; let quad=null; let padPct=0.02, fitMode='cover';
  const diagEl=$('#diag');
  function diag(...a){ diagEl.textContent=a.join(' '); }
  window.onerror=(m,s,l,c,e)=>{ diag('JS error:', m, '@', s+':'+l); };

  function setChip(id, cls, text){ const el=$(id); el.className='chip '+(cls||''); el.textContent=text; }
  function fitCanvasTo(img){ canvas.width=img.naturalWidth; canvas.height=img.naturalHeight; canvas.style.width='100%'; canvas.style.height='100%'; }
  function paddedQuad(q,pct){ if(!q) return null; const cx=(q[0].x+q[1].x+q[2].x+q[3].x)/4, cy=(q[0].y+q[1].y+q[2].y+q[3].y)/4; return q.map(pt=>({x:pt.x+(cx-pt.x)*pct, y:pt.y+(cy-pt.y)*pct})); }
  function fileNameFor(artFileName){ const artBase=(artFileName||'art').replace(/\.[^.]+$/,''); const mock=mockupName||'mockup'; const pattern=$('#namePattern').value||'{art}__in__{mockup}.png'; return pattern.replace('{art}',artBase).replace('{mockup}',mock); }
  function loadImageFromFile(file){ return new Promise((res,rej)=>{ const url=URL.createObjectURL(file); const img=new Image(); img.onload=()=>{URL.revokeObjectURL(url); res(img)}; img.onerror=(e)=>{diag('Image load failed:', file.name); rej(e)}; img.src=url; }); }

  function draw(preview=null){
    ctx.resetTransform(); ctx.clearRect(0,0,canvas.width,canvas.height);
    if(!baseImg){ diag('No base yet.'); return; }
    ctx.drawImage(baseImg,0,0,canvas.width,canvas.height);
    if(preview && quad){ const q=paddedQuad(quad,padPct); warp(ctx,preview,q,fitMode,24); }
    if(overlayImg) ctx.drawImage(overlayImg,0,0,canvas.width,canvas.height);
  }

  async function detectQuadFromOverlay(img){
    if(!img) return null;
    const W=img.naturalWidth,H=img.naturalHeight;
    const scale=Math.min(1, 600/Math.max(W,H));
    const w=Math.max(1,Math.round(W*scale)), h=Math.max(1,Math.round(H*scale));
    const off=document.createElement('canvas'); off.width=w; off.height=h;
    const oc=off.getContext('2d'); oc.drawImage(img,0,0,w,h);
    const data=oc.getImageData(0,0,w,h).data;
    const th=30; const mask=new Uint8Array(w*h);
    for(let i=0,px=0;i<data.length;i+=4,px++){ mask[px]=(data[i+3]<th)?1:0; }
    let any=0; for(const v of mask){ if(v){ any=1; break; } }
    if(!any) return null;
    const seen=new Uint8Array(w*h); const qx=new Int32Array(w*h), qy=new Int32Array(w*h);
    let bestCount=0, boundary=null;
    function push(nx,ny,tail){ if(nx>=0&&nx<w&&ny>=0&&ny<h){ const idx=ny*w+nx; if(mask[idx]&&!seen[idx]){ seen[idx]=1; qx[tail]=nx; qy[tail]=ny; return (tail+1)%(w*h);} } return tail; }
    for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ const idx=y*w+x; if(mask[idx]&&!seen[idx]){ let head=0,tail=0; seen[idx]=1; qx[tail]=x; qy[tail]=y; tail=1; let count=0; const bd=[]; while(head!=tail){ const cx=qx[head], cy=qy[head]; head=(head+1)%(w*h); count++; const idxc=cy*w+cx; const edge=(cx+1>=w||!mask[idxc+1])||(cx-1<0||!mask[idxc-1])||(cy+1>=h||!mask[idxc+w])||(cy-1<0||!mask[idxc-w]); if(edge) bd.push([cx,cy]); tail=push(cx+1,cy,tail); tail=push(cx-1,cy,tail); tail=push(cx,cy+1,tail); tail=push(cx,cy-1,tail); } if(count>bestCount){ bestCount=count; boundary=bd; } } } }
    if(!boundary||boundary.length<4) return null;
    let sx=0,sy=0; for(const p of boundary){ sx+=p[0]; sy+=p[1]; } const cx=sx/boundary.length, cy=sy/boundary.length;
    const corners=[null,null,null,null], bestR=[-1,-1,-1,-1];
    for(const p of boundary){ const dx=p[0]-cx, dy=p[1]-cy, r=dx*dx+dy*dy; let idx; if(dy<0){ idx=(dx<0)?0:1; } else { idx=(dx>=0)?2:3; } if(r>bestR[idx]){ bestR[idx]=r; corners[idx]=p; } }
    const s=1/scale; return corners.map(([x,y])=>({x:x*s,y:y*s}));
  }

  function defaultQuad(){ const w=canvas.width,h=canvas.height,m=Math.round(Math.min(w,h)*0.15); return [{x:m,y:m},{x:w-m,y:m},{x:w-m,y:h-m},{x:m,y:h-m}]; }

  function warp(ctx,img,quad,fit='cover',grid=20){
    let srcW=img.naturalWidth, srcH=img.naturalHeight;
    if(fit==='contain'){ const r=rectFromQuad(quad); const s=Math.min(r.w/srcW, r.h/srcH); const tmp=document.createElement('canvas'); tmp.width=Math.max(1,Math.floor(srcW*s)); tmp.height=Math.max(1,Math.floor(srcH*s)); tmp.getContext('2d').drawImage(img,0,0,tmp.width,tmp.height); img=tmp; srcW=tmp.width; srcH=tmp.height; }
    const [q00,q10,q11,q01]=quad;
    function Q(u,v){ return {x:(1-u)*(1-v)*q00.x+u*(1-v)*q10.x+u*v*q11.x+(1-u)*v*q01.x, y:(1-u)*(1-v)*q00.y+u*(1-v)*q10.y+u*v*q11.y+(1-u)*v*q01.y}; }
    for(let i=0;i<grid;i++){ const u0=i/grid,u1=(i+1)/grid; for(let j=0;j<grid;j++){ const v0=j/grid,v1=(j+1)/grid; const s00={x:u0*srcW,y:v0*srcH}, s10={x=u1*srcW,y:v0*srcH}, s11={x=u1*srcW,y:v1*srcH}, s01={x=u0*srcW,y:v1*srcH}; const d00=Q(u0,v0), d10=Q(u1,v0), d11=Q(u1,v1), d01=Q(u0,v1); tri(ctx,img,s00,s10,s11,d00,d10,d11); tri(ctx,img,s00,s11,s01,d00,d11,d01); } }
  }
  function rectFromQuad(q){ const xs=q.map(p=>p.x), ys=q.map(p=>p.y); const minx=Math.min(...xs), maxx=Math.max(...xs), miny=Math.min(...ys), maxy=Math.max(...ys); return {x:minx,y=miny,w:maxx-minx,h:maxy-miny}; }
  function tri(ctx,img,s0,s1,s2,d0,d1,d2){ ctx.save(); ctx.beginPath(); ctx.moveTo(d0.x,d0.y); ctx.lineTo(d1.x,d1.y); ctx.lineTo(d2.x,d2.y); ctx.closePath(); ctx.clip(); const m=affine(s0,s1,s2,d0,d1,d2); ctx.setTransform(m.a,m.b,m.c,m.d,m.e,m.f); ctx.drawImage(img,0,0); ctx.restore(); }
  function affine(s0,s1,s2,d0,d1,d2){ function solve(sa,sb,sc,r0,r1,r2){ const ax=sa.x,ay=sa.y,az=1,bx=sb.x,by=sb.y,bz=1,cx=sc.x,cy=sc.y,cz=1; const D=ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx); const Dx=r0*(by*cz-bz*cy)-ay*(r1*cz-bz*r2)+az*(r1*cy-by*r2); const Dy=ax*(r1*cz-bz*r2)-r0*(bx*cz-bz*cx)+az*(bx*r2-r1*cx); const Dz=ax*(by*r2-r1*cy)-ay*(bx*r2-r1*cx)+r0*(bx*cy-by*cx); return [Dx/D,Dy/D,Dz/D]; } const [a,c,e]=solve(s0,s1,s2,d0.x,d1.x,d2.x); const [b,d,f]=solve(s0,s1,s2,d0.y,d1.y,d2.y); return {a,b,c,d,e,f}; }

  async function canvasToBlobSafe(c){
    return new Promise(res=>{
      if(c.toBlob){
        c.toBlob(b=>{
          if(b) res(b);
          else{ try{ const d=c.toDataURL('image/png'); res(dataURLToBlob(d)); }catch(e){ res(null);} }
        }, 'image/png');
      } else { try{ const d=c.toDataURL('image/png'); res(dataURLToBlob(d)); }catch(e){ res(null);} }
    });
  }
  function dataURLToBlob(dataURL){ const parts=dataURL.split(','); const byteString=atob(parts[1]); const mime=parts[0].match(/:(.*?);/)[1]; const ab=new ArrayBuffer(byteString.length); const ia=new Uint8Array(ab); for(let i=0;i<byteString.length;i++) ia[i]=byteString.charCodeAt(i); return new Blob([ab],{type:mime}); }
  function downloadBlob(blob,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},1000); }

  // Inputs
  $('#baseInput').addEventListener('change', async e=>{
    const f=e.target.files[0]; if(!f) return;
    baseImg=await loadImageFromFile(f); mockupName=(f.name||'mockup').replace(/\.[^.]+$/,'');
    fitCanvasTo(baseImg); draw();
    setChip('#chipBase','ok','Base: loaded');
    $('#renderOneBtn').disabled=false; $('#renderAllBtn').disabled=false;
    diag('Base loaded:', baseImg.naturalWidth+'x'+baseImg.naturalHeight);
  });

  $('#overlayInput').addEventListener('change', async e=>{
    const f=e.target.files[0]; if(!f) return;
    overlayImg=await loadImageFromFile(f);
    if(baseImg && (overlayImg.naturalWidth!==baseImg.naturalWidth || overlayImg.naturalHeight!==baseImg.naturalHeight)){
      setChip('#chipOverlay','bad','Overlay: size mismatch'); diag('Overlay size mismatch. Base=', baseImg.naturalWidth+'x'+baseImg.naturalHeight, 'Overlay=', overlayImg.naturalWidth+'x'+overlayImg.naturalHeight); return;
    }
    setChip('#chipOverlay','ok','Overlay: loaded'); draw();
    const q=await detectQuadFromOverlay(overlayImg);
    if(q){ quad=q; setChip('#chipOpening','ok','Opening: auto'); diag('Opening auto-detected.'); } else { quad=null; setChip('#chipOpening','bad','Opening: not found'); diag('Opening not found. Default will be used.'); }
  });

  $('#artInput').addEventListener('change', async e=>{
    arts=Array.from(e.target.files||[]); setChip('#chipArt', arts.length?'ok':'', 'Art: '+arts.length);
    if(arts.length){ const img=await loadImageFromFile(arts[0]); arts._img=img; draw(img); }
  });

  $('#padRange').addEventListener('input', e=>{ padPct=parseFloat(e.target.value)/100; draw(arts._img||null); });
  $('#fitMode').addEventListener('change', e=>{ fitMode=e.target.value; draw(arts._img||null); });

  $('#renderOneBtn').addEventListener('click', async ()=>{
    if(!baseImg||!arts.length) return diag('Need base and at least one art.');
    if(!quad){ quad=overlayImg? (await detectQuadFromOverlay(overlayImg)) : null; if(!quad) quad=defaultQuad(); setChip('#chipOpening','ok', quad===defaultQuad()?'Opening: default':'Opening: auto'); }
    const img = await loadImageFromFile(arts[0]); arts._img=img; draw(img); diag('Preview rendered.');
  });

  $('#renderAllBtn').addEventListener('click', async ()=>{
    if(!baseImg||!arts.length) return diag('Need base and at least one art.');
    if(!quad){ quad=overlayImg? (await detectQuadFromOverlay(overlayImg)) : null; if(!quad) quad=defaultQuad(); setChip('#chipOpening','ok', quad===defaultQuad()?'Opening: default':'Opening: auto'); }
    for(const file of arts){
      const off=document.createElement('canvas'); off.width=canvas.width; off.height=canvas.height; const oc=off.getContext('2d');
      oc.drawImage(baseImg,0,0,off.width,off.height);
      const img=await loadImageFromFile(file);
      const q=paddedQuad(quad,padPct); warp(oc,img,q,fitMode,24);
      if(overlayImg) oc.drawImage(overlayImg,0,0,off.width,off.height);
      const blob=await canvasToBlobSafe(off);
      if(blob){ downloadBlob(blob, fileNameFor(file.name)); diag('Exported', file.name); }
      else { diag('Export failed — browser blocked toBlob/toDataURL.'); }
    }
  });

  function rectFromQuad(q){ const xs=q.map(p=>p.x), ys=q.map(p=>p.y); const minx=Math.min(...xs), maxx=Math.max(...xs), miny=Math.min(...ys), maxy=Math.max(...ys); return {x:minx,y:miny,w:maxx-minx,h:maxy-miny}; }
  function tri(ctx,img,s0,s1,s2,d0,d1,d2){ ctx.save(); ctx.beginPath(); ctx.moveTo(d0.x,d0.y); ctx.lineTo(d1.x,d1.y); ctx.lineTo(d2.x,d2.y); ctx.closePath(); ctx.clip(); const m=affine(s0,s1,s2,d0,d1,d2); ctx.setTransform(m.a,m.b,m.c,m.d,m.e,m.f); ctx.drawImage(img,0,0); ctx.restore(); }
  function affine(s0,s1,s2,d0,d1,d2){ function solve(sa,sb,sc,r0,r1,r2){ const ax=sa.x,ay=sa.y,az=1,bx=sb.x,by=sb.y,bz=1,cx=sc.x,cy=sc.y,cz=1; const D=ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx); const Dx=r0*(by*cz-bz*cy)-ay*(r1*cz-bz*r2)+az*(r1*cy-by*r2); const Dy=ax*(r1*cz-bz*r2)-r0*(bx*cz-bz*cx)+az*(bx*r2-r1*cx); const Dz=ax*(by*r2-r1*cy)-ay*(bx*r2-r1*cx)+r0*(bx*cy-by*cx); return [Dx/D,Dy/D,Dz/D]; } const [a,c,e]=solve(s0,s1,s2,d0.x,d1.x,d2.x); const [b,d,f]=solve(s0,s1,s2,d0.y,d1.y,d2.y); return {a,b,c,d,e,f}; }
})();