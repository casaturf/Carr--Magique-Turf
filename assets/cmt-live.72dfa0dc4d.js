(function(){
  var BASE='https://cmt-live.casaturf007.workers.dev/live/sorec/';
  var BASEP='https://cmt-live.casaturf007.workers.dev/live/pmu/';
  var PAS=60000,FIGE=3*60000;
  var p=decodeURIComponent(location.pathname);
  var md=p.match(/(\d{4}-\d{2}-\d{2})\/[^\/]*$/);
  if(!md)return;
  var date=md[1],code=null,m;
  if((m=p.match(/sorec_([RS]\d+)_(C\d+)_[a-z]+\.html$/i)))code=m[1].toUpperCase()+m[2].toUpperCase();
  else if((m=p.match(/[^\/]*?(R\d+C\d+)\.html$/i)))code=m[1].toUpperCase();
  if(!code)return;
  var sorecSeule=/sorec_[RS]\d+_C\d+_[a-z]+\.html$/i.test(p);
  var jp=new Date(date+'T12:00:00'),now=new Date();
  if(isNaN(jp)||Math.abs(now-jp)>36*3600*1000)return;

  function txt(c){return (c.textContent||'').replace(/[▲▼]/g,'').replace(/\s+/g,' ').trim();}
  function cibles(){
    var out=[];
    [].forEach.call(document.querySelectorAll('table'),function(t){
      var hr=t.tHead&&t.tHead.rows.length?t.tHead.rows[0]:t.rows[0];
      if(!hr)return;
      var iS=-1,iE=-1,iN=-1;
      for(var i=0;i<hr.cells.length;i++){
        var h=txt(hr.cells[i]);
        if(iS<0&&/sorec/i.test(h)&&!/^[ée]vol/i.test(h))iS=i;
        else if(iS>=0&&iE<0&&i===iS+1&&/^[ée]vol/i.test(h))iE=i;
        if(iN<0&&/^N°?$/i.test(h))iN=i;
      }
      if(iS<0||iN<0)return;
      var corps=t.tBodies.length?[].slice.call(t.tBodies[0].rows):[].slice.call(t.rows,1);
      var dec=2;
      for(var k=0;k<corps.length;k++){var c=corps[k].cells[iS];if(!c)continue;var v=txt(c).match(/^\d+(?:[.,](\d+))?$/);if(v){dec=v[1]?v[1].length:0;break;}}
      out.push({t:t,iS:iS,iE:iE,iN:iN,dec:Math.min(Math.max(dec,1),2)});
    });
    return out;
  }
  function ciblesPMU(){
    var out=[];
    if(sorecSeule)return out;
    [].forEach.call(document.querySelectorAll('table'),function(t){
      var hr=t.tHead&&t.tHead.rows.length?t.tHead.rows[0]:t.rows[0];
      if(!hr)return;
      var iC=-1,iN=-1;
      for(var i=0;i<hr.cells.length;i++){
        var h=txt(hr.cells[i]);
        if(iC<0&&/^cote( pmu)?$/i.test(h))iC=i;
        if(iN<0&&/^N°?$/i.test(h))iN=i;
      }
      if(iC>=0&&iN>=0)out.push({t:t,iC:iC,iN:iN});
    });
    return out;
  }
  var bandeau=null,majS='',majP='',finS=false,finP=false;
  function afficherBandeau(t){
    if(!bandeau){
      if(!t)return;
      bandeau=document.createElement('div');
      bandeau.id='cmt-live-bandeau';
      bandeau.style.cssText='margin:6px 0 10px;padding:6px 10px;border-radius:8px;background:#1A0A0A;border:1px solid #FF4D4D;color:#FFD700;font-size:12px;font-weight:bold;text-align:center';
      var ref=t.closest('.main-section')||t;
      ref.parentNode.insertBefore(bandeau,ref);
    }
    var fini=(!majS||finS)&&(!majP||finP),txtB;
    if(majS&&majP)txtB=(fini?'🏁 Cotes au départ':'🔴 Cotes en direct')+' — PMU '+majP+' · Sorec '+majS;
    else if(majP)txtB=(fini?'🏁 Cotes PMU au départ':'🔴 Cotes PMU en direct')+' — MAJ '+majP;
    else txtB=(fini?'🏁 Cotes Sorec au départ':'🔴 Cotes Sorec en direct')+(majS?' — MAJ '+majS:'');
    bandeau.textContent=txtB;
  }
  function colonneEvolPMU(tb){
    var t=tb.t,hr=t.tHead&&t.tHead.rows.length?t.tHead.rows[0]:t.rows[0];
    if(!hr||!hr.cells[tb.iC])return;
    var nx=hr.cells[tb.iC+1];
    if(nx&&nx.getAttribute('data-evp'))return;
    var hc=hr.cells[tb.iC],th=document.createElement(hc.tagName);
    th.className=hc.className;th.style.cssText=hc.style.cssText;th.setAttribute('data-evp','1');
    th.textContent='Évol PMU';
    hr.insertBefore(th,hc.nextSibling);
    var lignes=[].slice.call(t.rows).filter(function(r){return r!==hr&&r.cells.length>tb.iC;});
    lignes.forEach(function(r){
      var ref=r.cells[tb.iC],td=document.createElement(ref.tagName);
      td.className=ref.className;td.style.cssText=ref.style.cssText;td.setAttribute('data-evp','1');
      td.textContent='—';
      r.insertBefore(td,ref.nextSibling);
    });
    if(t._orig&&window.cmtOrdonner){
      var sp=document.createElement('span');sp.className='cmt-tri';sp.textContent=' ▲▼';sp.style.cssText='font-size:10px;opacity:.6';
      th.appendChild(sp);th.style.cursor='pointer';th.style.userSelect='none';th.title='Cliquer pour trier';
      th.addEventListener('click',function(){
        var i=th.cellIndex;
        t._dir=(t._col===i)?(t._dir===1?-1:(t._dir===-1?0:1)):1;t._col=i;
        window.cmtOrdonner(t);
        [].forEach.call(hr.cells,function(h2,j){var s=h2.querySelector('.cmt-tri');if(!s)return;
          var on=(j===i&&t._dir!==0);s.textContent=on?(t._dir===1?' ▲':' ▼'):' ▲▼';s.style.opacity=on?'1':'.6';});
      });
    }
  }
  function fmtPMU(v){var x=Math.round(Number(v)*10)/10;return (x%1===0)?String(x):x.toFixed(1);}
  function appliquerPMU(d){
    if(!d||!d.c)return;
    var tabs=ciblesPMU();
    if(!tabs.length)return;
    tabs.forEach(function(tb){
      colonneEvolPMU(tb);
      var corps=tb.t.tBodies.length?[].slice.call(tb.t.tBodies[0].rows):[].slice.call(tb.t.rows,1);
      corps.forEach(function(tr){
        var cn=tr.cells[tb.iN],cc=tr.cells[tb.iC];
        if(!cn||!cc)return;
        var n=(txt(cn).match(/\d+/)||[])[0];
        if(!n||!d.c[n])return;
        var v=d.c[n],cote=v[0],prec=v[1],part=v[3];
        if(part===0){cc.textContent='NP';cc.style.color='#888';cc.setAttribute('data-v','');var c0=tr.cells[tb.iC+1];if(c0&&c0.getAttribute('data-evp'))c0.textContent='—';return;}
        if(!cote)return;
        cc.textContent=fmtPMU(cote);
        cc.setAttribute('data-v',String(cote));
        var ce=tr.cells[tb.iC+1];
        if(ce&&ce.getAttribute('data-evp')){
          if(prec&&Math.abs(cote-prec)>=0.05){
            var df=cote-prec,sp=document.createElement('span');
            sp.style.color=df<0?'#00FF88':'#FF6B6B';
            sp.textContent=(df<0?'▼':'▲')+Math.abs(df).toFixed(1);
            ce.textContent='';ce.appendChild(sp);ce.setAttribute('data-v',df.toFixed(2));
          }else{ce.textContent='—';ce.removeAttribute('data-v');}
        }
      });
    });
    majP=d.maj||majP;
    afficherBandeau(tabs[0].t);
  }
  function appliquer(d){
    if(!d||!d.c)return;
    var tabs=cibles();
    if(!tabs.length)return;
    tabs.forEach(function(tb){
      var corps=tb.t.tBodies.length?[].slice.call(tb.t.tBodies[0].rows):[].slice.call(tb.t.rows,1);
      corps.forEach(function(tr){
        var cn=tr.cells[tb.iN],cs=tr.cells[tb.iS];
        if(!cn||!cs)return;
        var n=(txt(cn).match(/\d+/)||[])[0];
        if(!n||!d.c[n])return;
        var v=d.c[n],cote=v[0],prec=v[1],part=v[3];
        if(!cs.hasAttribute('data-coul'))cs.setAttribute('data-coul',cs.style.color||'');
        if(part===0){cs.textContent='NP';cs.style.color='#888';}
        else if(cote){cs.textContent=Number(cote).toFixed(tb.dec);cs.style.color=cs.getAttribute('data-coul');}
        else return;
        cs.setAttribute('data-v',part===0?'':String(cote||''));
        if(tb.iE>=0&&tr.cells[tb.iE]){
          var ce=tr.cells[tb.iE];
          if(part!==0&&cote&&prec){
            var df=cote-prec,sp=document.createElement('span');
            if(Math.abs(df)<0.05){sp.style.color='#888';sp.textContent='=';}
            else if(df<0){sp.style.color='#00FF88';sp.textContent='▼'+Math.abs(df).toFixed(1);}
            else{sp.style.color='#FF6B6B';sp.textContent='▲'+df.toFixed(1);}
            ce.textContent='';ce.appendChild(sp);ce.setAttribute('data-v',df.toFixed(2));
          }else{ce.textContent='—';ce.removeAttribute('data-v');}
        }
      });
    });
    majS=d.maj||majS;
    afficherBandeau(tabs[0].t);
  }
  var ORDRE=['simple gagnant','simple placé','jumelé gagnant','jumelé placé','jumelé ordre','trio','trio ordre','tiercé','quarté','quinté+','multi'];
  function nomJeu(s){return String(s||'').replace(/Jumele(?!é)/ig,'Jumelé').replace(/Tierce(?!é)/ig,'Tiercé').replace(/Quarte(?!é)/ig,'Quarté').replace(/Quinte(?!é)/ig,'Quinté').replace(/Place(?!é)/ig,'Placé').trim();}
  function coulJeu(n){var s=n.toLowerCase();
    if(s.indexOf('simple')===0)return['#5E2B97','#fff'];
    if(s.indexOf('jumel')===0)return['#E8651A','#fff'];
    if(s.indexOf('trio')===0)return['#E5A800','#000'];
    if(s.indexOf('tierc')===0)return['#2E9E3A','#fff'];
    if(s.indexOf('quart')===0)return['#1565C0','#fff'];
    if(s.indexOf('quint')===0)return['#C62828','#fff'];
    if(s.indexOf('multi')===0)return['#D81B8C','#fff'];
    return['#444','#fff'];}
  var barre=null;
  function afficherJeux(j){
    if(barre||!j||!j.length)return;
    var noms=j.map(nomJeu).filter(function(x){return x;});
    if(!noms.length)return;
    noms.sort(function(a,b){var ia=ORDRE.indexOf(a.toLowerCase()),ib=ORDRE.indexOf(b.toLowerCase());return (ia<0?99:ia)-(ib<0?99:ib);});
    barre=document.createElement('div');
    barre.id='cmt-jeux-sorec';
    barre.style.cssText='margin:6px auto 10px;padding:8px 12px;border-radius:10px;background:#111;border:1px solid #C1272D;text-align:center;max-width:1100px';
    var t=document.createElement('div');
    t.textContent='🇲🇦 JEUX SOREC';
    t.style.cssText='color:#FFD700;font-weight:bold;font-size:13px;margin-bottom:6px';
    barre.appendChild(t);
    var w=document.createElement('div');
    w.style.cssText='display:flex;flex-wrap:wrap;gap:6px;justify-content:center';
    noms.forEach(function(n){var c=coulJeu(n),sp=document.createElement('span');sp.textContent=n;sp.style.cssText='background:'+c[0]+';color:'+c[1]+';padding:4px 10px;border-radius:8px;font-size:12px;font-weight:bold;font-style:italic';w.appendChild(sp);});
    barre.appendChild(w);
    var h=document.querySelector('.header');
    if(sorecSeule&&h){
      var bas=noms.map(function(x){return x.toLowerCase();});
      [].forEach.call(h.querySelectorAll('div'),function(dv){
        var e=dv.children;if(!e.length)return;
        for(var i=0;i<e.length;i++){if(e[i].tagName!=='SPAN'||bas.indexOf(nomJeu(e[i].textContent).toLowerCase())<0)return;}
        if(dv.parentNode)dv.parentNode.removeChild(dv);
      });
    }
    if(h&&h.parentNode)h.parentNode.insertBefore(barre,h.nextSibling);
    else document.body.insertBefore(barre,document.body.firstChild);
  }
  function marquerNP(d){
    if(!d||!d.c)return;
    var ks=Object.keys(d.c),np=ks.filter(function(n){return d.c[n]&&d.c[n][3]===0;});
    if(!np.length||np.length*2>ks.length)return;
    var K='fvnp_'+date+'_'+code,o={};
    try{o=JSON.parse(localStorage.getItem(K)||'{}')||{};}catch(e){o={};}
    var ch=false;
    np.forEach(function(n){if(!o[n]){o[n]=1;ch=true;}});
    if(!ch)return;
    try{localStorage.setItem(K,JSON.stringify(o));}catch(e){return;}
    try{window.dispatchEvent(new StorageEvent('storage',{key:K}));}catch(e){}
  }
  var timer=null,fini=false,avecTable=false,absS=false,absP=sorecSeule;
  function lireJ(u){
    return fetch(u+date+'/'+code+'.json?m='+Math.floor(Date.now()/30000),{cache:'no-store'}).then(function(r){
      if(r.status===404)return {absent:true};
      return r.ok?r.json():null;
    }).catch(function(){return null;});
  }
  function verifierFin(){
    if((finS||finP)&&(finS||absS)&&(finP||absP)){fini=true;if(timer)clearInterval(timer);}
  }
  function charger(){
    if(fini||document.hidden)return;
    if(!avecTable&&barre)return;
    lireJ(BASE).then(function(d){
      if(!d)return;
      if(d.absent){absS=true;verifierFin();return;}
      absS=false;
      afficherJeux(d.j);
      marquerNP(d);
      appliquer(d);
      if(d.statut==='OFFICIAL'||(d.t&&Date.now()>d.t+FIGE))finS=true;
      afficherBandeau(null);
      verifierFin();
    });
    if(sorecSeule)return;
    lireJ(BASEP).then(function(d){
      if(!d)return;
      if(d.absent){absP=true;verifierFin();return;}
      absP=false;
      marquerNP(d);
      appliquerPMU(d);
      if(d.statut==='FIN'||(d.t&&Date.now()>d.t+FIGE))finP=true;
      afficherBandeau(null);
      verifierFin();
    });
  }
  function demarrer(){
    avecTable=cibles().length>0||ciblesPMU().length>0;
    charger();
    if(avecTable)timer=setInterval(charger,PAS);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)charger();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',demarrer);else demarrer();
})();