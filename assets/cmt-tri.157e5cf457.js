
(function(){
function nb(t){
  t=(t||'').replace(/\s+/g,' ').trim();
  if(!t)return null;
  var neg=t.charAt(0)==='▼';
  var s=t.replace(/^[▲▼]/,'').replace(/[%€\s ]/g,'').replace(',','.');
  if(/^[+-]?\d+(\.\d+)?$/.test(s)){var v=parseFloat(s);return neg?-v:v;}
  return null;
}
function etat(ro){return ro.classList.contains('cmt-r-np')?2:(ro.classList.contains('cmt-r-ec')?1:0);}
function ordonner(tb){
  var b=tb.tBodies[0],rows;
  if(!tb._dir)rows=tb._orig.slice();
  else{
    var i=tb._col,dir=tb._dir;
    rows=tb._orig.map(function(ro,k){var t=ro.cells[i].textContent.trim();return {r:ro,k:k,t:t,v:nb(t)};});
    rows.sort(function(a,z){
      if((a.t==='')!==(z.t===''))return a.t===''?1:-1;
      var d;
      if(a.v!==null&&z.v!==null)d=a.v-z.v;
      else if(a.v!==null)d=-1;else if(z.v!==null)d=1;
      else d=a.t.localeCompare(z.t,'fr',{numeric:true});
      return d*dir||a.k-z.k;});
    rows=rows.map(function(x){return x.r;});
  }
  var g=[[],[],[]];rows.forEach(function(ro){g[etat(ro)].push(ro);});
  g[0].concat(g[1],g[2]).forEach(function(ro){b.appendChild(ro);});
}
window.cmtOrdonner=ordonner;
function simple(tb){
  if(tb.hasAttribute('data-nosort')||tb.classList.contains('fvt')||tb.closest('.fv'))return false;
  var th=tb.tHead;if(!th||th.rows.length!==1||tb.tBodies.length!==1)return false;
  var b=tb.tBodies[0],hr=th.rows[0],n=hr.cells.length;
  if(n<2||b.rows.length<2)return false;
  for(var i=0;i<n;i++){var h=hr.cells[i];if(h.colSpan>1||h.rowSpan>1||h.getAttribute('onclick'))return false;}
  for(var r=0;r<b.rows.length;r++){var ro=b.rows[r];if(ro.cells.length!==n)return false;
    for(var c=0;c<n;c++){if(ro.cells[c].colSpan>1||ro.cells[c].rowSpan>1)return false;}}
  return true;
}

/* ===== Non-partants / Ecartes (meme memoire que la Fiche VIP) ===== */
var NP=null;
(function(){
  if(document.getElementById('cmtdata'))return;
  var pth=decodeURIComponent(location.pathname);
  var m=pth.match(/(\d{4}-\d{2}-\d{2})\/[^\/]*?(R\d+C\d+)\.html$/);
  if(!m){var ms=pth.match(/(\d{4}-\d{2}-\d{2})\/sorec_([RS]\d+)_(C\d+)_[a-z]+\.html$/i);if(ms)m=[ms[0],ms[1],ms[2].toUpperCase()+ms[3].toUpperCase()];}
  if(!m)return;
  var KNP='fvnp_'+m[1]+'_'+m[2],KEC='fvec_'+m[1]+'_'+m[2];
  function lire(k){try{return JSON.parse(localStorage.getItem(k)||'')||{};}catch(e){return {};}}
  function ecrire(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
  var off=lire(KNP),ec=lire(KEC),tables=[],nums={},maxN=0;
  function colN(tb){
    var hr=tb.tHead.rows[0];
    for(var i=0;i<hr.cells.length;i++){
      var t=hr.cells[i].textContent.replace(/[▲▼\s]/g,'');
      if(t==='N°'||t==='N'||t==='Num'||t==='Numéro'){
        var rs=tb.tBodies[0].rows,ok=[].filter.call(rs,function(ro){return /^\d{1,2}$/.test(ro.cells[i].textContent.trim());}).length;
        if(ok>=Math.max(2,rs.length/2))return i;
      }
    }
    return -1;
  }
  [].forEach.call(document.querySelectorAll('table'),function(tb){
    if(!simple(tb))return;
    var i=colN(tb);if(i<0)return;
    var hr=tb.tHead.rows[0],th=document.createElement('th');th.textContent='Écarter';
    hr.insertBefore(th,hr.cells[i+1]||null);
    [].forEach.call(tb.tBodies[0].rows,function(ro){
      var td=ro.cells[i],tx=td.textContent.trim(),te=document.createElement('td');te.className='cmt-e';
      if(!/^\d{1,2}$/.test(tx)){ro.insertBefore(te,ro.cells[i+1]||null);return;}
      var n=parseInt(tx,10);
      nums[n]=1;if(n>maxN)maxN=n;
      td.classList.add('cmt-n');
      var cb=document.createElement('input');cb.type='checkbox';cb.title='partant (décocher = non-partant)';cb.setAttribute('data-n',n);cb.className='cmt-cb-p';
      td.insertBefore(cb,td.firstChild);
      var ce=document.createElement('input');ce.type='checkbox';ce.title='écarter ce cheval';ce.setAttribute('data-n',n);ce.className='cmt-cb-e';
      te.appendChild(ce);ro.insertBefore(te,ro.cells[i+1]||null);
      ro.setAttribute('data-cmt-n',n);
    });
    tables.push(tb);
  });
  var badge=[].map.call(document.querySelectorAll('.info-badge'),function(e){return e.textContent;}).join(' ').match(/(\d+)\s*partants/);
  if(badge&&+badge[1]>maxN&&+badge[1]<=30)maxN=+badge[1];
  if(!maxN)return;
  for(var k=1;k<=maxN;k++)nums[k]=1;

  /* listes de numeros en texte : "11 - 1 - 6 - 5" */
  var EXCL='table,script,style,.header,.nav-buttons,.arrivee-box,.back-button,footer,.footer,.cmt-bar,a,button,select,option,input,textarea,.premium-wall';
  var zone=document.querySelector('.container')||document.body;
  var re=/(?<![\w\-.,])\d{1,2}(?:\s+-\s+\d{1,2})+(?![\w\-.,])/g;
  var w=document.createTreeWalker(zone,NodeFilter.SHOW_TEXT,null),txt=[],nd;
  while((nd=w.nextNode())){if(nd.parentElement&&!nd.parentElement.closest(EXCL)&&/\d\s+-\s+\d/.test(nd.nodeValue))txt.push(nd);}
  txt.forEach(function(nd){
    var s=nd.nodeValue,out=document.createDocumentFragment(),last=0,mm,touche=false;re.lastIndex=0;
    while((mm=re.exec(s))){
      var ns=mm[0].match(/\d{1,2}/g);
      if(!ns.every(function(x){return +x>=1&&+x<=maxN;}))continue;
      touche=true;
      out.appendChild(document.createTextNode(s.slice(last,mm.index)));
      mm[0].split(/(\d{1,2})/).forEach(function(p){
        if(/^\d{1,2}$/.test(p)){var sp=document.createElement('span');sp.className='cmt-num cmt-lst';sp.setAttribute('data-n',+p);sp.textContent=p;out.appendChild(sp);}
        else if(p)out.appendChild(document.createTextNode(p));
      });
      last=mm.index+mm[0].length;
    }
    if(touche){out.appendChild(document.createTextNode(s.slice(last)));nd.parentNode.replaceChild(out,nd);}
  });
  /* pastilles : element qui ne contient qu'un numero */
  [].forEach.call(zone.querySelectorAll('span,div,b,strong,em,small,i,li,p'),function(el){
    if(el.children.length||el.closest(EXCL))return;
    var t=el.textContent.trim();
    if(/^\d{1,2}$/.test(t)&&+t>=1&&+t<=maxN&&!el.classList.contains('cmt-num')){el.classList.add('cmt-num','cmt-pill');el.setAttribute('data-n',+t);}
  });

  /* bandeau */
  var bar=document.createElement('details');bar.className='cmt-bar';if(!tables.length)bar.open=true;
  var html='<summary></summary><div class="cmt-chips">';
  for(var n=1;n<=maxN;n++)html+='<label class="cmt-chip" data-n="'+n+'"><input type="checkbox" class="cmt-cb-p" data-n="'+n+'" title="partant (décocher = non-partant)"><b>'+n+'</b><input type="checkbox" class="cmt-cb-e" data-n="'+n+'" title="écarter"><small>éc.</small></label>';
  html+='</div><button type="button" class="cmt-raz-np">Tout réactiver</button><button type="button" class="cmt-raz-ec">Tout remettre</button>'+
    '<div class="cmt-note">Case du numéro décochée = non-partant (barré, en bas). Case « éc. » cochée = cheval écarté (orange). Choix partagés avec la Fiche VIP et toutes les pages de cette course, mémorisés sur cet appareil. Les calculs du site ne changent pas.</div>';
  bar.innerHTML=html;
  var ref=document.querySelector('.container .arrivee-box')||document.querySelector('.container .main-section')||document.querySelector('.container .nav-buttons');
  if(ref&&ref.classList.contains('nav-buttons'))ref.parentNode.insertBefore(bar,ref.nextSibling);
  else if(ref)ref.parentNode.insertBefore(bar,ref.classList.contains('arrivee-box')?ref.nextSibling:ref);
  else zone.insertBefore(bar,zone.firstChild);

  function appliquer(){
    var npl=[],ecl=[];
    for(var n=1;n<=maxN;n++){if(off[n])npl.push(n);else if(ec[n])ecl.push(n);}
    [].forEach.call(document.querySelectorAll('.cmt-cb-p'),function(c){c.checked=!off[c.getAttribute('data-n')];});
    [].forEach.call(document.querySelectorAll('.cmt-cb-e'),function(c){var n=c.getAttribute('data-n');c.checked=!!ec[n];c.disabled=!!off[n];});
    [].forEach.call(document.querySelectorAll('tr[data-cmt-n]'),function(ro){var n=ro.getAttribute('data-cmt-n');
      ro.classList.toggle('cmt-r-np',!!off[n]);ro.classList.toggle('cmt-r-ec',!off[n]&&!!ec[n]);});
    [].forEach.call(document.querySelectorAll('.cmt-num'),function(e){var n=e.getAttribute('data-n');
      e.classList.toggle('cmt-x-np',!!off[n]);e.classList.toggle('cmt-x-ec',!off[n]&&!!ec[n]);});
    [].forEach.call(bar.querySelectorAll('.cmt-chip'),function(e){var n=e.getAttribute('data-n');
      e.classList.toggle('np',!!off[n]);e.classList.toggle('ec',!off[n]&&!!ec[n]);});
    tables.forEach(function(tb){if(tb._orig)ordonner(tb);else{
      var b=tb.tBodies[0],g=[[],[],[]];[].forEach.call(b.rows,function(ro){g[etat(ro)].push(ro);});
      g[0].concat(g[1],g[2]).forEach(function(ro){b.appendChild(ro);});}});
    bar.querySelector('summary').innerHTML='🐴 Non-partants : <b>'+(npl.length?npl.join(', '):'aucun')+'</b> &nbsp;|&nbsp; Écartés : <b>'+(ecl.length?ecl.join(', '):'aucun')+'</b> &nbsp;<small>(partagé avec la Fiche VIP)</small>';
  }
  document.addEventListener('change',function(e){
    var c=e.target,n=c.getAttribute&&c.getAttribute('data-n');if(!n)return;
    if(c.classList.contains('cmt-cb-p')){if(c.checked)delete off[n];else off[n]=1;ecrire(KNP,off);}
    else if(c.classList.contains('cmt-cb-e')){if(c.checked)ec[n]=1;else delete ec[n];ecrire(KEC,ec);}
    else return;
    appliquer();
  });
  bar.querySelector('.cmt-raz-np').addEventListener('click',function(){off={};ecrire(KNP,off);appliquer();});
  bar.querySelector('.cmt-raz-ec').addEventListener('click',function(){ec={};ecrire(KEC,ec);appliquer();});
  window.addEventListener('storage',function(e){if(e.key===KNP||e.key===KEC){off=lire(KNP);ec=lire(KEC);appliquer();}});
  window.addEventListener('pageshow',function(e){if(e.persisted){off=lire(KNP);ec=lire(KEC);appliquer();}});
  NP={appliquer:appliquer};
})();

/* ===== Tri des colonnes ===== */
function init(tb){
  if(!simple(tb))return;
  var b=tb.tBodies[0],hr=tb.tHead.rows[0];
  tb._orig=[].slice.call(b.rows);tb._col=-1;tb._dir=0;
  [].forEach.call(hr.cells,function(h,i){
    var sp=document.createElement('span');sp.className='cmt-tri';sp.textContent=' ▲▼';sp.style.cssText='font-size:10px;opacity:.6';
    h.appendChild(sp);h.style.cursor='pointer';h.style.userSelect='none';h.title='Cliquer pour trier';
    h.addEventListener('click',function(){
      var i=h.cellIndex;
      tb._dir=(tb._col===i)?(tb._dir===1?-1:(tb._dir===-1?0:1)):1;tb._col=i;
      ordonner(tb);
      [].forEach.call(hr.cells,function(h2,j){var s=h2.querySelector('.cmt-tri');if(!s)return;
        var on=(j===i&&tb._dir!==0);s.textContent=on?(tb._dir===1?' ▲':' ▼'):' ▲▼';s.style.opacity=on?'1':'.6';});
    });
  });
}
[].forEach.call(document.querySelectorAll('table'),init);
if(NP)NP.appliquer();
})();
