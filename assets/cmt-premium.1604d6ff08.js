
(function() {
  // ─── Protection anti-copie (dissuasion) ───
  document.addEventListener('contextmenu', function(e){ e.preventDefault(); }, false);
  document.addEventListener('copy', function(e){ e.preventDefault(); }, false);
  document.addEventListener('cut', function(e){ e.preventDefault(); }, false);
  document.addEventListener('dragstart', function(e){ e.preventDefault(); }, false);
  document.addEventListener('keydown', function(e){
    // Bloque Ctrl+C / Ctrl+U (source) / Ctrl+S (sauvegarde) / F12 (devtools)
    if ((e.ctrlKey || e.metaKey) && ['c','u','s','x'].indexOf((e.key||'').toLowerCase()) !== -1) { e.preventDefault(); }
    if (e.key === 'F12') { e.preventDefault(); }
  }, false);

  // ─── Fingerprint navigateur natif (sans bibliothèque) ───
  function genererFingerprint() {
    try {
      var stored = localStorage.getItem('cmt_fp');
      if (stored) return stored;

      var data = [];
      // Écran
      data.push(screen.width + 'x' + screen.height + 'x' + screen.colorDepth);
      data.push(screen.availWidth + 'x' + screen.availHeight);
      // Timezone + langue
      data.push(new Date().getTimezoneOffset());
      data.push(navigator.language || '');
      data.push((navigator.languages || []).join(','));
      // User agent + plateforme
      data.push(navigator.userAgent || '');
      data.push(navigator.platform || '');
      data.push(navigator.hardwareConcurrency || 0);
      data.push(navigator.deviceMemory || 0);
      // Canvas fingerprint (hash unique par GPU/navigateur)
      try {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('CMT-FP-' + navigator.userAgent, 2, 15);
        ctx.fillStyle = 'rgba(102,204,0,0.7)';
        ctx.fillText('CMT-FP-' + navigator.userAgent, 4, 17);
        data.push(canvas.toDataURL().substring(0, 100));
      } catch(e) { data.push('nocanvas'); }
      // WebGL renderer
      try {
        var gl = document.createElement('canvas').getContext('webgl');
        if (gl) {
          var dbg = gl.getExtension('WEBGL_debug_renderer_info');
          if (dbg) {
            data.push(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '');
            data.push(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
          }
        }
      } catch(e) {}

      // Hash simple (FNV-1a 32-bit)
      var str = data.join('|');
      var hash = 2166136261;
      for (var i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = (hash * 16777619) >>> 0;
      }
      var fp = 'fp_' + hash.toString(16);
      localStorage.setItem('cmt_fp', fp);
      return fp;
    } catch(e) {
      return 'fp_fallback';
    }
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

  var params = new URLSearchParams(window.location.search);
  var urlCode = params.get('cmt_code');
  var urlExpiry = params.get('cmt_expiry');
  if (urlCode && urlExpiry) {
    localStorage.setItem('cmt_premium_code', urlCode);
    localStorage.setItem('cmt_premium_expiry', urlExpiry);
    window.history.replaceState({}, '', window.location.pathname);
  }

  var code = localStorage.getItem('cmt_premium_code');
  var expiry = localStorage.getItem('cmt_premium_expiry');
  if (!code || !expiry || new Date(expiry) < new Date()) {
    localStorage.removeItem('cmt_premium_code');
    localStorage.removeItem('cmt_premium_expiry');
    document.body.classList.add('premium-locked');
    return;
  }
  // FAIL-CLOSED : on reste verrouille tant que le worker n'a pas confirme ok:true
  document.body.classList.add('premium-locked');
  var fingerprint = genererFingerprint();
  try {
    fetch('https://carre-magique-premium.casaturf007.workers.dev/api/verify', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({code: code, fingerprint: fingerprint, deviceId: getDeviceId(), url: location.pathname})
    }).then(function(r){
      if (!r.ok) return r.json().then(function(d){ return {_status: r.status, data: d}; }).catch(function(){ return null; });
      return r.json();
    }).then(function(data){
      if (!data) { document.body.classList.add('premium-locked'); return; }
      // Cas 403 : Limite 2 appareils ou code invalide
      if (data._status === 403) {
        localStorage.removeItem('cmt_premium_code');
        localStorage.removeItem('cmt_premium_expiry');
        document.body.classList.add('premium-locked');
        if (data.data && data.data.error) {
          var alert_msg = document.createElement('div');
          alert_msg.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#FF6B6B;color:#fff;padding:14px 24px;border-radius:8px;z-index:10000;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
          alert_msg.textContent = '🚫 ' + data.data.error;
          document.body.appendChild(alert_msg);
          setTimeout(function(){ if(alert_msg.parentNode) alert_msg.parentNode.removeChild(alert_msg); }, 6000);
        }
        return;
      }
      if (!data.ok) {
        localStorage.removeItem('cmt_premium_code');
        localStorage.removeItem('cmt_premium_expiry');
        document.body.classList.add('premium-locked');
      } else {
        // Succes confirme par le worker : on deverrouille
        document.body.classList.remove('premium-locked');
        if (data.alerte72h) {
          var d = document.createElement('div');
          d.className = 'premium-alert';
          d.textContent = data.messageAlerte;
          var c = document.querySelector('.container');
          if (c) c.insertBefore(d, c.firstChild);
        }
        if (data.nom) { afficherWatermark(data.nom, code); }
      }
    }).catch(function(){/* reseau/CORS — FAIL-CLOSED : rester verrouille */ document.body.classList.add('premium-locked'); });
  } catch(e) { document.body.classList.add('premium-locked'); }

  function afficherWatermark(nom, codeUser) {
    // Identifiant compte = 4 derniers caractères du code (anti-partage)
    var tag = codeUser ? codeUser.substring(codeUser.length - 4) : '';
    var d = new Date();
    var dateStr = ('0'+d.getDate()).slice(-2) + '/' + ('0'+(d.getMonth()+1)).slice(-2) + '/' + d.getFullYear() + ' ' + ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2);
    var libelle = '★ CMT — ' + nom + (tag ? ' #' + tag : '') + ' · ' + dateStr + ' ★';
    if (document.getElementById('cmt-watermark')) return;
    var wm = document.createElement('div');
    wm.id = 'cmt-watermark';
    wm.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'pointer-events:none', 'z-index:9999', 'overflow:hidden',
      'user-select:none', '-webkit-user-select:none'
    ].join(';');
    // Mosaique : plusieurs lignes repetees sur toute la hauteur
    var inner = '';
    for (var i = 0; i < 14; i++) {
      inner += '<div style="white-space:nowrap;font-size:16px;font-weight:bold;color:rgba(255,255,255,0.11);letter-spacing:3px;text-transform:uppercase;margin:34px 0;transform:rotate(-32deg);">'
             + (libelle + '   ').repeat(6) + '</div>';
    }
    wm.innerHTML = inner;
    document.body.appendChild(wm);
  }
})();
