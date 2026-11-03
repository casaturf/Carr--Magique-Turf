
(function() {
  function genererFingerprint() {
    try {
      var stored = localStorage.getItem('cmt_fp');
      if (stored) return stored;
      var data = [screen.width+'x'+screen.height, navigator.language||'', navigator.userAgent||''];
      var str = data.join('|');
      var hash = 2166136261;
      for (var i = 0; i < str.length; i++) { hash ^= str.charCodeAt(i); hash = (hash * 16777619) >>> 0; }
      var fp = 'fp_' + hash.toString(16);
      localStorage.setItem('cmt_fp', fp);
      return fp;
    } catch(e) { return 'fp_fallback'; }
  }

  // ─── Device ID UUID persistant (identique au login) ───
  function getDeviceId() {
    var KEY = 'cmt_device_id';
    var id = null;
    try { id = localStorage.getItem(KEY); } catch(e) {}
    if (!id) { try { id = sessionStorage.getItem(KEY); } catch(e) {} }
    if (!id) {
      try {
        var m = document.cookie.match('(?:^|;)\s*' + KEY + '=([^;]+)');
        if (m) id = decodeURIComponent(m[1]);
      } catch(e) {}
    }
    if (!id) {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      try { localStorage.setItem(KEY, id); } catch(e) {}
      try { sessionStorage.setItem(KEY, id); } catch(e) {}
      try {
        var exp = new Date(Date.now() + 365*24*60*60*1000).toUTCString();
        document.cookie = KEY + '=' + encodeURIComponent(id) + '; expires=' + exp + '; path=/; SameSite=Strict';
      } catch(e) {}
    } else {
      try { if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, id); } catch(e) {}
      try { if (!sessionStorage.getItem(KEY)) sessionStorage.setItem(KEY, id); } catch(e) {}
    }
    return id;
  }

  function lockVip(msg) {
    document.body.classList.add('premium-locked');
    var wall = document.getElementById('vip-wall');
    if (wall) wall.style.display = 'block';
    if (msg) { var e = document.getElementById('vip-code-error'); if (e) e.textContent = msg; }
  }

  function unlockVip(nom, code) {
    document.body.classList.remove('premium-locked');
    var wall = document.getElementById('vip-wall');
    if (wall) wall.style.display = 'none';
    var tag = code ? code.substring(code.length - 4) : '';
    var d = new Date();
    var dateStr = ('0'+d.getDate()).slice(-2) + '/' + ('0'+(d.getMonth()+1)).slice(-2) + '/' + d.getFullYear() + ' ' + ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2);
    var libelle = '💎 CMT VIP — ' + nom + (tag ? ' #' + tag : '') + ' · ' + dateStr + ' 💎';
    if (document.getElementById('cmt-watermark')) return;
    var wm = document.createElement('div');
    wm.id = 'cmt-watermark';
    wm.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden;user-select:none;-webkit-user-select:none;';
    var inner = '';
    for (var i = 0; i < 14; i++) {
      inner += '<div style="white-space:nowrap;font-size:16px;font-weight:bold;color:rgba(255,215,0,0.12);letter-spacing:3px;text-transform:uppercase;margin:34px 0;transform:rotate(-32deg);">'
             + (libelle + '   ').repeat(6) + '</div>';
    }
    wm.innerHTML = inner;
    document.body.appendChild(wm);
  }

  function verifierVip(code, onSuccess, onFail) {
    var fp = genererFingerprint();
    fetch('https://carre-magique-premium.casaturf007.workers.dev/api/verify', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({code: code, fingerprint: fp, deviceId: getDeviceId(), url: location.pathname})
    }).then(function(r){ return r.json(); }).then(function(data){
      if (data.ok && data.pack && data.pack.startsWith('vip')) {
        onSuccess(data);
      } else if (data.ok && data.pack && !data.pack.startsWith('vip')) {
        onFail('⚠️ Votre abonnement Premium standard ne donne pas accès à l\'Extrait VIP. Souscrivez à l\'offre Extrait VIP.');
      } else {
        onFail(data.error || 'Code invalide');
      }
    }).catch(function(){ onFail('Erreur de connexion. Reessayez avec une connexion active.'); });
  }

  // Code depuis URL
  var params = new URLSearchParams(window.location.search);
  var urlCode = params.get('vip_code');
  if (urlCode) {
    localStorage.setItem('cmt_vip_code', urlCode.toUpperCase());
    window.history.replaceState({}, '', window.location.pathname);
  }

  var code = localStorage.getItem('cmt_vip_code');
  if (!code) { lockVip(); return; }

  verifierVip(code,
    function(data) {
      unlockVip(data.nom || '?', code);
      if (data.alerte72h && data.messageAlerte) {
        var d = document.createElement('div');
        d.style.cssText = 'position:fixed;top:0;left:0;right:0;background:linear-gradient(90deg,#7A3500,#2D1F00);color:#FFD700;text-align:center;padding:10px;font-weight:bold;z-index:9998;font-size:13px;';
        d.textContent = data.messageAlerte;
        document.body.appendChild(d);
      }
    },
    function(msg) { localStorage.removeItem('cmt_vip_code'); lockVip(msg); }
  );

  window.saisirCodeVip = function() {
    var input = document.getElementById('vip-code-input');
    if (!input || !input.value.trim()) return;
    var code = input.value.trim().toUpperCase();
    verifierVip(code,
      function(data) {
        localStorage.setItem('cmt_vip_code', code);
        unlockVip(data.nom || '?', code);
        var wall = document.getElementById('vip-wall');
        if (wall) wall.style.display = 'none';
        document.body.classList.remove('premium-locked');
      },
      function(msg) { document.getElementById('vip-code-error').textContent = '❌ ' + msg; }
    );
  };
})();
