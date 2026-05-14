// ============================================================
// WORKER CLOUDFLARE — CARRÉ MAGIQUE TURF PREMIUM v2
// Style aligné sur carremagique-turf.fr
// KV Namespace binding: CARRE_MAGIQUE_TURF
// Variable d'environnement: ADMIN_PASSWORD
// ============================================================

const ALLOWED_ORIGINS = [
  'https://carremagique-turf.com',
  'https://www.carremagique-turf.com',
];

function getCorsHeaders(request) {
  const origin = request ? (request.headers.get('Origin') || '') : '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'CMT-';
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (i < 3) code += '-';
  }
  return code;
}

function generateFingerprint(request) {
  const ua = request.headers.get('User-Agent') || '';
  const lang = request.headers.get('Accept-Language') || '';
  return btoa(ua + '|' + lang).substring(0, 32);
}

function jsonResponse(data, status = 200, request = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' },
  });
}

// Rate limiting via KV : max 10 tentatives/min par IP
async function checkRateLimit(env, ip) {
  try {
    const key = `rl:${ip}:${Math.floor(Date.now() / 60000)}`;
    const raw = await env.CARRE_MAGIQUE_TURF.get(key);
    const count = raw ? parseInt(raw) : 0;
    if (count >= 10) return false;
    await env.CARRE_MAGIQUE_TURF.put(key, String(count + 1), { expirationTtl: 120 });
    return true;
  } catch(e) { return true; }
}

async function handleVerify(request, env) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    // Rate limiting : max 10 tentatives/minute par IP
    const allowed = await checkRateLimit(env, ip);
    if (!allowed) return jsonResponse({ ok: false, error: 'Trop de tentatives. Réessayez dans 1 minute.' }, 429, request);

    const { code, fingerprint, deviceId } = await request.json();
    if (!code) return jsonResponse({ ok: false, error: 'Code requis' }, 400, request);
    const raw = await env.CARRE_MAGIQUE_TURF.get(`code:${code.toUpperCase()}`);
    if (!raw) return jsonResponse({ ok: false, error: 'Code invalide' }, 403);
    const data = JSON.parse(raw);
    if (!data.actif) return jsonResponse({ ok: false, error: 'Code désactivé' }, 403);
    const now = Date.now();
    if (now > data.expiration) {
      data.actif = false;
      await env.CARRE_MAGIQUE_TURF.put(`code:${code.toUpperCase()}`, JSON.stringify(data));
      return jsonResponse({ ok: false, error: 'Code expiré' }, 403);
    }
    // Fingerprint combiné : deviceId UUID persistant + fingerprint navigateur
    const fp = deviceId
      ? ('dev_' + deviceId.replace(/[^a-zA-Z0-9_-]/g,'').substring(0,36))
      : (fingerprint || generateFingerprint(request));
    const country = request.headers.get('CF-IPCountry') || '';

    // Tracker IPs récentes pour détection partage (anti-abus)
    if (!data.ips) data.ips = [];
    const ipEntry = { ip: ip, country: country, fp: fp.substring(0, 12), ts: now };
    // Garder uniquement les 20 dernières IPs vues
    data.ips = [ipEntry, ...data.ips.filter(e => e.ip !== ip)].slice(0, 20);

    if (!data.devices.includes(fp)) {
      if (data.devices.length >= 2) {
        // Log la tentative pour audit
        if (!data.tentatives_refus) data.tentatives_refus = [];
        data.tentatives_refus = [{ ip: ip, country: country, fp: fp.substring(0, 12), ts: now }, ...data.tentatives_refus].slice(0, 10);
        await env.CARRE_MAGIQUE_TURF.put(`code:${code.toUpperCase()}`, JSON.stringify(data));
        return jsonResponse({ ok: false, error: 'Limite de 2 appareils atteinte. Contactez le support pour réinitialiser vos appareils.' }, 403);
      }
      data.devices.push(fp);
    }
    await env.CARRE_MAGIQUE_TURF.put(`code:${code.toUpperCase()}`, JSON.stringify(data));

    const heuresRestantes = (data.expiration - now) / (1000 * 60 * 60);
    const alerte72h = heuresRestantes <= 72;
    return jsonResponse({
      ok: true, nom: data.nom, pack: data.pack,
      expiration: new Date(data.expiration).toISOString(),
      heuresRestantes: Math.round(heuresRestantes), alerte72h,
      messageAlerte: alerte72h ? `⚠️ Votre abonnement expire dans ${Math.round(heuresRestantes)}h. Renouvelez maintenant !` : null,
    });
  } catch (e) { return jsonResponse({ ok: false, error: 'Erreur serveur' }, 500); }
}

async function handleGenerate(request, env) {
  try {
    const { password, nom, email, pack } = await request.json();
    if (password !== env.ADMIN_PASSWORD) return jsonResponse({ ok: false, error: 'Mot de passe admin incorrect' }, 401);
    if (!nom || !pack) return jsonResponse({ ok: false, error: 'Nom et pack requis' }, 400);
    const code = generateCode();
    const now = Date.now();
    let expiration;
    if (pack === 'jour') expiration = now + 24 * 60 * 60 * 1000;
    else if (pack === 'decouverte') expiration = now + 7 * 24 * 60 * 60 * 1000;
    else if (pack === 'quinzaine') expiration = now + 15 * 24 * 60 * 60 * 1000;
    else if (pack === 'mois') expiration = now + 30 * 24 * 60 * 60 * 1000;
    else return jsonResponse({ ok: false, error: 'Pack invalide' }, 400);
    const record = { nom, email: email || '', pack, code, devices: [], expiration, actif: true, creeLe: new Date(now).toISOString() };
    await env.CARRE_MAGIQUE_TURF.put(`code:${code}`, JSON.stringify(record));
    const indexRaw = await env.CARRE_MAGIQUE_TURF.get('index:codes') || '[]';
    const index = JSON.parse(indexRaw);
    index.push({ code, nom, pack, expiration, creeLe: record.creeLe });
    await env.CARRE_MAGIQUE_TURF.put('index:codes', JSON.stringify(index));
    return jsonResponse({ ok: true, code, nom, pack, expiration: new Date(expiration).toISOString() });
  } catch (e) { return jsonResponse({ ok: false, error: 'Erreur serveur: ' + e.message }, 500); }
}

async function handleList(request, env) {
  try {
    const { password } = await request.json();
    if (password !== env.ADMIN_PASSWORD) return jsonResponse({ ok: false, error: 'Mot de passe admin incorrect' }, 401);
    const indexRaw = await env.CARRE_MAGIQUE_TURF.get('index:codes') || '[]';
    const index = JSON.parse(indexRaw);
    const abonnes = [];
    for (const entry of index) {
      const raw = await env.CARRE_MAGIQUE_TURF.get(`code:${entry.code}`);
      if (raw) {
        const data = JSON.parse(raw);
        const now = Date.now();
        const heuresRestantes = (data.expiration - now) / (1000 * 60 * 60);
        abonnes.push({ ...data, heuresRestantes: Math.round(heuresRestantes), expire: now > data.expiration, alerte72h: heuresRestantes > 0 && heuresRestantes <= 72 });
      }
    }
    return jsonResponse({ ok: true, total: abonnes.length, abonnes });
  } catch (e) { return jsonResponse({ ok: false, error: 'Erreur serveur' }, 500); }
}

async function handleRevoke(request, env) {
  try {
    const { password, code } = await request.json();
    if (password !== env.ADMIN_PASSWORD) return jsonResponse({ ok: false, error: 'Mot de passe admin incorrect' }, 401);
    const raw = await env.CARRE_MAGIQUE_TURF.get(`code:${code}`);
    if (!raw) return jsonResponse({ ok: false, error: 'Code introuvable' }, 404);
    const data = JSON.parse(raw);
    data.actif = false;
    await env.CARRE_MAGIQUE_TURF.put(`code:${code}`, JSON.stringify(data));
    return jsonResponse({ ok: true, message: `Code ${code} révoqué` });
  } catch (e) { return jsonResponse({ ok: false, error: 'Erreur serveur' }, 500); }
}

async function handlePurgeOne(request, env) {
  try {
    const { password, code } = await request.json();
    if (password !== env.ADMIN_PASSWORD) return jsonResponse({ ok: false, error: 'Mot de passe admin incorrect' }, 401);
    const raw = await env.CARRE_MAGIQUE_TURF.get(`code:${code}`);
    if (!raw) return jsonResponse({ ok: false, error: 'Code introuvable' }, 404);
    const data = JSON.parse(raw);
    const now = Date.now();
    if (data.actif && now <= data.expiration) return jsonResponse({ ok: false, error: 'Impossible de supprimer un abonné actif' }, 400);
    await env.CARRE_MAGIQUE_TURF.delete(`code:${code}`);
    const indexRaw = await env.CARRE_MAGIQUE_TURF.get('index:codes') || '[]';
    const index = JSON.parse(indexRaw);
    const indexFiltre = index.filter(e => e.code !== code);
    await env.CARRE_MAGIQUE_TURF.put('index:codes', JSON.stringify(indexFiltre));
    return jsonResponse({ ok: true, message: `Code ${code} supprimé` });
  } catch (e) { return jsonResponse({ ok: false, error: 'Erreur serveur' }, 500); }
}

async function handlePurge(request, env) {
  try {
    const { password } = await request.json();
    if (password !== env.ADMIN_PASSWORD) return jsonResponse({ ok: false, error: 'Mot de passe admin incorrect' }, 401);
    const indexRaw = await env.CARRE_MAGIQUE_TURF.get('index:codes') || '[]';
    const index = JSON.parse(indexRaw);
    const now = Date.now();
    let supprime = 0;
    const indexFiltre = [];
    for (const entry of index) {
      const raw = await env.CARRE_MAGIQUE_TURF.get(`code:${entry.code}`);
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (now > data.expiration || !data.actif) {
        await env.CARRE_MAGIQUE_TURF.delete(`code:${entry.code}`);
        supprime++;
      } else {
        indexFiltre.push(entry);
      }
    }
    await env.CARRE_MAGIQUE_TURF.put('index:codes', JSON.stringify(indexFiltre));
    return jsonResponse({ ok: true, supprime, message: `${supprime} abonné(s) expiré(s) supprimé(s)` });
  } catch (e) { return jsonResponse({ ok: false, error: 'Erreur serveur' }, 500); }
}

async function handleResetDevices(request, env) {
  try {
    const { password, code } = await request.json();
    if (password !== env.ADMIN_PASSWORD) return jsonResponse({ ok: false, error: 'Mot de passe admin incorrect' }, 401);
    if (!code) return jsonResponse({ ok: false, error: 'Code requis' }, 400);
    const raw = await env.CARRE_MAGIQUE_TURF.get(`code:${code.toUpperCase()}`);
    if (!raw) return jsonResponse({ ok: false, error: 'Code introuvable' }, 404);
    const data = JSON.parse(raw);
    const ancien_count = (data.devices || []).length;
    data.devices = [];
    await env.CARRE_MAGIQUE_TURF.put(`code:${code.toUpperCase()}`, JSON.stringify(data));
    return jsonResponse({ ok: true, message: `${ancien_count} appareil(s) réinitialisé(s) pour ${data.nom}` });
  } catch (e) { return jsonResponse({ ok: false, error: 'Erreur serveur' }, 500); }
}

// ============================================================
// CSS — Style identique à carremagique-turf.fr
// ============================================================

const CSS_SITE = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #000000; color: #FFFFFF; min-height: 100vh; padding: 0; margin: 0; }
.container { max-width: 1600px; margin: 0 auto; padding: 0 10px 10px 10px; }
.header { text-align: center; margin-bottom: 5px; margin-top: 0; padding: 20px 0 10px; }
.logo { width: 120px; height: auto; margin-bottom: 0; }
.main-section { background: linear-gradient(135deg, #1A1A1A 0%, #0D0D0D 100%); border: 2px solid #00B4D8; border-radius: 10px; padding: 15px; margin-bottom: 6px; }
.section-title { font-size: 20px; color: #FF6B6B; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 2px solid #FF6B6B; }
.course-title { font-size: 24px; color: #00B4D8; margin-bottom: 2px; text-shadow: 0 0 20px rgba(0, 180, 216, 0.5); }
input[type="text"], input[type="password"], input[type="email"], select { width: 100%; padding: 12px 16px; background: #0D0D0D; border: 2px solid #00B4D8; border-radius: 8px; color: #FFFFFF; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 15px; margin-bottom: 12px; outline: none; transition: all 0.3s ease; }
input:focus, select:focus { border-color: #FF6B6B; box-shadow: 0 0 15px rgba(255, 107, 107, 0.3); }
input::placeholder { color: #555; }
.btn-primary { width: 100%; padding: 14px; background: #00B4D8; border: none; border-radius: 8px; color: #000000; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 15px; font-weight: bold; cursor: pointer; transition: all 0.3s ease; text-transform: uppercase; letter-spacing: 1px; }
.btn-primary:hover { background: #0096B7; transform: translateY(-2px); box-shadow: 0 5px 20px rgba(0, 180, 216, 0.3); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-western { width: 100%; padding: 14px; background: #FFCC00; border: none; border-radius: 8px; color: #000; font-size: 15px; font-weight: bold; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 8px; text-decoration: none; }
.btn-western:hover { background: #e6b800; transform: translateY(-2px); }
.btn-whatsapp { width: 100%; padding: 14px; background: #25D366; border: none; border-radius: 8px; color: #fff; font-size: 15px; font-weight: bold; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 8px; text-decoration: none; }
.btn-whatsapp:hover { background: #1da851; transform: translateY(-2px); }
.msg { padding: 12px 16px; border-radius: 8px; margin-top: 12px; font-size: 14px; font-weight: bold; display: none; }
.msg.error { background: rgba(255, 107, 107, 0.15); border: 2px solid #FF6B6B; color: #FF6B6B; display: block; }
.msg.success { background: rgba(0, 180, 216, 0.15); border: 2px solid #00B4D8; color: #00B4D8; display: block; }
.msg.warning { background: rgba(255, 215, 0, 0.15); border: 2px solid #FFD700; color: #FFD700; display: block; }
.pricing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.price-card { background: linear-gradient(135deg, #1A1A1A 0%, #0D0D0D 100%); border: 2px solid #00B4D8; border-radius: 10px; padding: 20px 15px; text-align: center; transition: all 0.3s ease; position: relative; overflow: hidden; }
.price-card:hover { transform: translateY(-3px); border-color: #FF6B6B; box-shadow: 0 10px 30px rgba(255, 107, 107, 0.3); }
.price-card.featured { border-color: #FFD700; }
.price-card.featured::before { content: 'POPULAIRE'; position: absolute; top: 8px; right: -30px; background: #FFD700; color: #000; font-size: 9px; font-weight: bold; padding: 3px 32px; transform: rotate(45deg); letter-spacing: 1px; }
.price-label { font-size: 12px; color: #C8A882; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
.price-amount { font-size: 36px; font-weight: bold; color: #FFFFFF; }
.price-amount span { font-size: 18px; color: #00B4D8; }
.price-period { font-size: 13px; color: #888; margin-top: 4px; }
.price-converted { font-size: 12px; color: #FFD700; margin-top: 8px; min-height: 18px; }
.converter-box { background: linear-gradient(135deg, #1A1A1A 0%, #0D0D0D 100%); border: 2px solid #00B4D8; border-radius: 10px; padding: 16px; margin-bottom: 12px; text-align: center; }
.converter-box select { width: auto; display: inline-block; margin: 8px 0; }
.converter-result { margin-top: 10px; font-size: 16px; font-weight: bold; color: #FFD700; }
.contact-bar { display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin-top: 12px; margin-bottom: 20px; }
.contact-link { color: #00B4D8; text-decoration: none; font-size: 12px; transition: color 0.3s; }
.contact-link:hover { color: #FF6B6B; }
.footer { text-align: center; padding: 20px 10px; margin-top: 20px; border-top: 1px solid #2A2A2A; }
.footer-copy { font-size: 11px; color: #555; }
table { width: 100%; border-collapse: collapse; margin-top: 12px; }
thead th { background: #00B4D8; color: #000000; padding: 10px 8px; text-align: center; font-weight: bold; font-size: 13px; }
tbody td { padding: 8px 6px; text-align: center; border-bottom: 1px solid #2A2A2A; font-size: 13px; }
tbody tr:hover { background: rgba(0, 180, 216, 0.1); }
.badge-actif { background: rgba(0,180,216,0.15); color: #00B4D8; padding: 3px 10px; border-radius: 10px; font-size: 11px; font-weight: bold; display: inline-block; }
.badge-expire { background: rgba(255,107,107,0.15); color: #FF6B6B; padding: 3px 10px; border-radius: 10px; font-size: 11px; font-weight: bold; display: inline-block; }
.badge-alerte { background: rgba(255,215,0,0.15); color: #FFD700; padding: 3px 10px; border-radius: 10px; font-size: 11px; font-weight: bold; display: inline-block; }
.btn-red { background: #FF6B6B; color: #fff; border: none; font-size: 11px; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: bold; }
.btn-red:hover { background: #cc0000; }
.btn-copy { background: #2A2A2A; color: #fff; border: 2px solid #00B4D8; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; width: 100%; margin-top: 8px; transition: all 0.3s; }
.btn-copy:hover { background: #00B4D8; color: #000; }
.result-box { background: #0D0D0D; border: 2px solid #FFD700; border-radius: 10px; padding: 16px; margin-top: 16px; display: none; text-align: center; }
.code-display { font-size: 24px; font-weight: bold; color: #FFD700; letter-spacing: 3px; margin: 10px 0; }
.spinner { display: inline-block; width: 18px; height: 18px; border: 2px solid transparent; border-top: 2px solid #000; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; margin-right: 8px; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 768px) { .pricing-grid { grid-template-columns: 1fr; } .price-amount { font-size: 28px; } .container { padding: 0 8px 8px; } }
`;

// ============================================================
// PAGE: Accès Premium (abonné)
// ============================================================

function getLockedPage(workerUrl) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Espace Premium - Carré Magique Turf</title>
<meta name="description" content="Espace Premium Carré Magique Turf - Accédez aux pronostics exclusifs R1.">
<style>${CSS_SITE}</style>
</head>
<body>
<div class="container">

  <div class="header">
    <img src="https://carremagique-turf.fr/logo.png" alt="Carré Magique Turf" class="logo" onerror="this.style.display='none'">
    <h1 class="course-title">ESPACE PREMIUM</h1>
    <p style="color:#C8A882; font-size:14px;">Accès exclusif aux analyses R1</p>
  </div>

  <div class="main-section">
    <div class="section-title">🔒 Accès Premium</div>
    <input type="text" id="codeInput" placeholder="ENTREZ VOTRE CODE D'ACCÈS" maxlength="23" autocomplete="off" spellcheck="false" style="text-align:center; text-transform:uppercase; letter-spacing:2px; font-size:17px;">
    <button class="btn-primary" id="btnVerify" onclick="verifyCode()">VÉRIFIER MON CODE</button>
    <div class="msg" id="msgBox"></div>
  </div>

  <div class="section-title" style="margin:12px 0 8px;">💰 Nos Offres</div>
  <div class="pricing-grid">
    <div class="price-card">
      <div class="price-label">Journalier</div>
      <div class="price-amount">1<span>€</span></div>
      <div class="price-period">par jour</div>
      <div class="price-converted" id="prixJour">—</div>
    </div>
    <div class="price-card" style="border-color:#00FF88;">
      <div class="price-label" style="color:#00FF88;">🎁 Offre Découverte</div>
      <div class="price-amount">7<span>€</span></div>
      <div class="price-period">7 jours</div>
      <div class="price-converted" id="prixDecouverte">—</div>
    </div>
    <div class="price-card featured">
      <div class="price-label">Pack de Bienvenue</div>
      <div class="price-amount">25<span>€</span></div>
      <div class="price-period">par mois</div>
      <div class="price-converted" id="prixMois">—</div>
    </div>
    <div class="price-card" style="border-color:#FF6B6B;">
      <div class="price-label" style="color:#FF6B6B;">📅 Pack 15 Jours</div>
      <div class="price-amount">15<span>€</span></div>
      <div class="price-period">15 jours</div>
      <div class="price-converted" id="prixQuinzaine">—</div>
    </div>
  </div>

  <div class="converter-box">
    <span style="color:#C8A882; font-size:12px; letter-spacing:1px;">CONVERTIR EN VOTRE DEVISE</span><br>
    <select id="deviseSelect" onchange="convertir()">
      <option value="EUR">🇪🇺 EUR — Euro</option>
      <option value="MAD">🇲🇦 MAD — Dirham</option>
      <option value="USD">🇺🇸 USD — Dollar US</option>
      <option value="GBP">🇬🇧 GBP — Livre Sterling</option>
      <option value="XOF">🇸🇳 XOF — Franc CFA (BCEAO)</option>
      <option value="XAF">🇨🇲 XAF — Franc CFA (BEAC)</option>
      <option value="TND">🇹🇳 TND — Dinar Tunisien</option>
      <option value="DZD">🇩🇿 DZD — Dinar Algérien</option>
      <option value="CAD">🇨🇦 CAD — Dollar Canadien</option>
      <option value="CHF">🇨🇭 CHF — Franc Suisse</option>
    </select>
    <div class="converter-result" id="convertResult">Sélectionnez une devise</div>
  </div>

  <div class="section-title" style="margin:12px 0 8px;">🎯 Choisissez votre offre</div>
  <div class="main-section" style="padding:12px;">
    <div style="display:flex;gap:8px;margin-bottom:4px;">
      <button id="sel1" onclick="selectOffre('jour','1')" style="flex:1;padding:14px 8px;background:#0D0D0D;border:2px solid #00B4D8;border-radius:8px;color:#fff;font-size:14px;font-weight:bold;cursor:pointer;transition:all 0.3s ease;text-align:center;">1€<br><span style="font-size:11px;color:#888;font-weight:normal;">1 Jour</span></button>
      <button id="sel5" onclick="selectOffre('decouverte','7')" style="flex:1;padding:14px 8px;background:#0D0D0D;border:2px solid #00FF88;border-radius:8px;color:#fff;font-size:14px;font-weight:bold;cursor:pointer;transition:all 0.3s ease;text-align:center;">7€<br><span style="font-size:11px;color:#888;font-weight:normal;">7 Jours</span></button>
      <button id="sel15" onclick="selectOffre('quinzaine','15')" style="flex:1;padding:14px 8px;background:#0D0D0D;border:2px solid #FF6B6B;border-radius:8px;color:#fff;font-size:14px;font-weight:bold;cursor:pointer;transition:all 0.3s ease;text-align:center;">15€<br><span style="font-size:11px;color:#888;font-weight:normal;">15 Jours</span></button>
      <button id="sel25" onclick="selectOffre('mois','25')" style="flex:1;padding:14px 8px;background:#0D0D0D;border:2px solid #FFD700;border-radius:8px;color:#fff;font-size:14px;font-weight:bold;cursor:pointer;transition:all 0.3s ease;text-align:center;">25€<br><span style="font-size:11px;color:#888;font-weight:normal;">1 Mois</span></button>
    </div>
    <div id="offreChoisie" style="text-align:center;color:#FFD700;font-size:13px;font-weight:bold;min-height:20px;margin-bottom:4px;"></div>
  </div>

  <div class="section-title" style="margin:12px 0 8px;">💳 Modes de Paiement</div>
  <div class="main-section" style="padding:12px;" id="paiementSection">
    <div id="btnWesternUnionWrap">
      <div class="btn-western" onclick="payerWesternUnion()">🌐 WESTERN UNION</div>
    </div>
    <a id="lnkCashplus" href="#" target="_blank" style="text-decoration:none;">
      <div style="width:100%;padding:14px;background:#FFFFFF;border:none;border-radius:8px;color:#000;font-size:15px;font-weight:bold;cursor:pointer;transition:all 0.3s ease;display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;">💵 CASHPLUS</div>
    </a>
    <a id="lnkWafacash" href="#" target="_blank" style="text-decoration:none;">
      <div style="width:100%;padding:14px;background:#FFFFFF;border:none;border-radius:8px;color:#000;font-size:15px;font-weight:bold;cursor:pointer;transition:all 0.3s ease;display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;">💵 WAFACASH</div>
    </a>
    <a id="lnkVirement" href="#" target="_blank" style="text-decoration:none;">
      <div style="width:100%;padding:14px;background:#FFFFFF;border:none;border-radius:8px;color:#000;font-size:15px;font-weight:bold;cursor:pointer;transition:all 0.3s ease;display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;">🏦 VIREMENT BANCAIRE</div>
    </a>
    <a id="lnkRia" href="#" target="_blank" style="text-decoration:none;">
      <div style="width:100%;padding:14px;background:#FFFFFF;border:none;border-radius:8px;color:#000;font-size:15px;font-weight:bold;cursor:pointer;transition:all 0.3s ease;display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;">💸 RIA</div>
    </a>
    <a id="lnkMoneygram" href="#" target="_blank" style="text-decoration:none;">
      <div style="width:100%;padding:14px;background:#FFFFFF;border:none;border-radius:8px;color:#000;font-size:15px;font-weight:bold;cursor:pointer;transition:all 0.3s ease;display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;">💸 MONEYGRAM</div>
    </a>
    <a id="lnkOrange" href="#" target="_blank" style="text-decoration:none;">
      <div style="width:100%;padding:14px;background:#FF6600;border:none;border-radius:8px;color:#fff;font-size:15px;font-weight:bold;cursor:pointer;transition:all 0.3s ease;display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;"><span style="width:22px;height:22px;border-radius:50%;background:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:#FF6600;">O</span> ORANGE MONEY</div>
    </a>

    <p style="color:#888;font-size:11px;text-align:center;margin-top:8px;">⬆️ Choisissez d'abord votre offre ci-dessus, puis cliquez sur votre mode de paiement.</p>
  </div>

  <div class="btn-whatsapp" onclick="contacterWhatsapp()" style="cursor:pointer;">📱 CONTACTER VIA WHATSAPP</div>

  <div class="contact-bar">
    <a href="mailto:casaturf007@gmail.com" class="contact-link">📧 casaturf007@gmail.com</a>
    <a href="https://youtube.com/@Carre-magique-turf" target="_blank" class="contact-link">🎥 YouTube</a>
  </div>

  <footer class="footer">
    <div class="footer-copy">&copy; 2026 Carré Magique Turf - Tous droits réservés</div>
  </footer>
</div>

<script>
const WORKER_URL = '${workerUrl}';
let tauxChange = {};

// ── Device ID UUID persistant multi-storage ──────────────────
function getDeviceId() {
  var KEY = 'cmt_device_id';
  var id = null;
  // 1. localStorage
  try { id = localStorage.getItem(KEY); } catch(e) {}
  // 2. sessionStorage fallback
  if (!id) { try { id = sessionStorage.getItem(KEY); } catch(e) {} }
  // 3. cookie fallback
  if (!id) {
    try {
      var m = document.cookie.match('(?:^|;)\\s*' + KEY + '=([^;]+)');
      if (m) id = decodeURIComponent(m[1]);
    } catch(e) {}
  }
  // 4. IndexedDB fallback (async, skip pour l'instant)
  if (!id) {
    // Générer un UUID v4
    id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    // Stocker dans tous les storages disponibles
    try { localStorage.setItem(KEY, id); } catch(e) {}
    try { sessionStorage.setItem(KEY, id); } catch(e) {}
    try {
      var exp = new Date(Date.now() + 365*24*60*60*1000).toUTCString();
      document.cookie = KEY + '=' + encodeURIComponent(id) + '; expires=' + exp + '; path=/; SameSite=Strict';
    } catch(e) {}
  } else {
    // Synchroniser les storages si l'un manque
    try { if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, id); } catch(e) {}
    try { if (!sessionStorage.getItem(KEY)) sessionStorage.setItem(KEY, id); } catch(e) {}
  }
  return id;
}

function getFingerprint() {
  try {
    var stored = localStorage.getItem('cmt_fp');
    if (stored) return stored;

    var data = [];
    data.push(screen.width + 'x' + screen.height + 'x' + screen.colorDepth);
    data.push(screen.availWidth + 'x' + screen.availHeight);
    data.push(new Date().getTimezoneOffset());
    data.push(navigator.language || '');
    data.push((navigator.languages || []).join(','));
    data.push(navigator.userAgent || '');
    data.push(navigator.platform || '');
    data.push(navigator.hardwareConcurrency || 0);
    data.push(navigator.deviceMemory || 0);
    // Canvas fingerprint
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
    // Hash FNV-1a 32-bit
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

async function verifyCode() {
  const code = document.getElementById('codeInput').value.trim();
  const btn = document.getElementById('btnVerify');
  const msg = document.getElementById('msgBox');
  if (!code) { msg.className = 'msg error'; msg.textContent = 'Veuillez entrer votre code.'; return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>VÉRIFICATION...';
  try {
    const res = await fetch(WORKER_URL + '/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, fingerprint: getFingerprint(), deviceId: getDeviceId() })
    });
    const data = await res.json();
    if (data.ok) {
      if (data.alerte72h) { msg.className = 'msg warning'; msg.textContent = data.messageAlerte; }
      else { msg.className = 'msg success'; msg.textContent = '✅ Bienvenue ' + data.nom + ' ! Redirection...'; }
      localStorage.setItem('cmt_premium_code', code);
      localStorage.setItem('cmt_premium_expiry', data.expiration);
      setTimeout(() => { window.location.href = 'https://carremagique-turf.com?cmt_code=' + encodeURIComponent(code) + '&cmt_expiry=' + encodeURIComponent(data.expiration); }, 2000);
    } else { msg.className = 'msg error'; msg.textContent = '❌ ' + data.error; }
  } catch (e) { msg.className = 'msg error'; msg.textContent = '❌ Erreur de connexion.'; }
  btn.disabled = false;
  btn.textContent = 'VÉRIFIER MON CODE';
}

document.getElementById('codeInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') verifyCode(); });

async function chargerTaux() {
  try {
    const base = window.location.origin;
    const res = await fetch(base + '/api/taux');
    const rates = await res.json();
    if (rates && Object.keys(rates).length > 0) {
      tauxChange = rates;
      convertir();
    } else {
      document.getElementById('convertResult').textContent = 'Taux indisponibles';
    }
  } catch (e) { document.getElementById('convertResult').textContent = 'Taux indisponibles'; }
}

function convertir() {
  const devise = document.getElementById('deviseSelect').value;
  const taux = tauxChange[devise];
  if (!taux) { document.getElementById('convertResult').textContent = 'Devise non disponible'; return; }
  document.getElementById('prixJour').textContent = '≈ ' + (1 * taux).toFixed(2) + ' ' + devise;
  document.getElementById('prixDecouverte').textContent = '≈ ' + (7 * taux).toFixed(2) + ' ' + devise;
  document.getElementById('prixMois').textContent = '≈ ' + (25 * taux).toFixed(2) + ' ' + devise;
  document.getElementById('prixQuinzaine').textContent = '≈ ' + (15 * taux).toFixed(2) + ' ' + devise;
  document.getElementById('convertResult').textContent = '1€ = ' + taux.toFixed(4) + ' ' + devise;
}

document.addEventListener("DOMContentLoaded", chargerTaux);

let offreChoisie = '';
let montantChoisi = '';
const nomOffres = { jour: 'Journalier (1€/jour)', decouverte: 'Découverte (7€/7 jours)', quinzaine: 'Pack 15 Jours (15€)', mois: 'Pack Mensuel (25€/mois)' };

function selectOffre(offre, montant) {
  offreChoisie = offre;
  montantChoisi = montant;
  document.querySelectorAll('[id^=sel]').forEach(b => { b.style.background = '#0D0D0D'; b.style.boxShadow = 'none'; });
  const btn = offre === 'jour' ? document.getElementById('sel1') : offre === 'decouverte' ? document.getElementById('sel5') : offre === 'quinzaine' ? document.getElementById('sel15') : document.getElementById('sel25');
  btn.style.background = 'rgba(0,180,216,0.2)';
  btn.style.boxShadow = '0 0 15px rgba(0,180,216,0.4)';
  document.getElementById('offreChoisie').textContent = '✅ ' + nomOffres[offre];
  const msg = encodeURIComponent('Bonjour, je souhaite souscrire au ' + nomOffres[offre] + ' Premium Carré Magique Turf');
  document.getElementById('lnkCashplus').href = 'https://wa.me/212601972400?text=' + msg + encodeURIComponent(' — paiement via CashPlus');
  document.getElementById('lnkWafacash').href = 'https://wa.me/212601972400?text=' + msg + encodeURIComponent(' — paiement via Wafacash');
  document.getElementById('lnkVirement').href = 'https://wa.me/212601972400?text=' + msg + encodeURIComponent(' — paiement via Virement Bancaire');
  document.getElementById('lnkRia').href = 'https://wa.me/212601972400?text=' + msg + encodeURIComponent(' — paiement via RIA');
  document.getElementById('lnkMoneygram').href = 'https://wa.me/212601972400?text=' + msg + encodeURIComponent(' — paiement via MoneyGram');
  document.getElementById('lnkOrange').href = 'https://wa.me/212601972400?text=' + msg + encodeURIComponent(' — paiement via Orange Money');
  document.getElementById('lnkWesternUnion').href = 'https://wa.me/212601972400?text=' + msg + encodeURIComponent(' — paiement via Western Union');
}

function payerWesternUnion() {
  if (!montantChoisi) { alert("⚠️ Veuillez d'abord choisir votre offre"); return; }
  window.open("https://wa.me/212601972400?text=" + encodeURIComponent("Bonjour, je souhaite payer " + montantChoisi + "€ via Western Union pour l'offre " + nomOffres[offreChoisie] + " — Carré Magique Turf"), "_blank");
}

function contacterWhatsapp() {
  let msg = "Bonjour, je souhaite m'abonner au Premium Carré Magique Turf";
  if (offreChoisie) msg += ' — offre ' + nomOffres[offreChoisie];
  window.open('https://wa.me/212601972400?text=' + encodeURIComponent(msg), '_blank');
}
</script>
</body>
</html>`;
}

// ============================================================
// PAGE: Admin
// ============================================================

function getAdminPage(workerUrl) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CMT Admin - Gestion Premium</title>
<style>${CSS_SITE}</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1 class="course-title">🔒 CMT ADMIN</h1>
    <p style="color:#C8A882;">Gestion Premium</p>
  </div>

  <div class="main-section" id="loginSection">
    <div class="section-title">🔑 Authentification</div>
    <input type="password" id="adminPass" placeholder="Mot de passe admin">
    <button class="btn-primary" onclick="login()">CONNEXION</button>
    <div class="msg" id="loginMsg"></div>
  </div>

  <div class="main-section" id="genSection" style="display:none;">
    <div class="section-title">➕ Générer un code abonné</div>
    <label style="font-size:12px;color:#C8A882;">Nom de l'abonné</label>
    <input type="text" id="genNom" placeholder="Ex: Ahmed M.">
    <label style="font-size:12px;color:#C8A882;">Email (optionnel)</label>
    <input type="email" id="genEmail" placeholder="Ex: ahmed@email.com">
    <label style="font-size:12px;color:#C8A882;">Pack</label>
    <select id="genPack">
      <option value="jour">Journalier — 1€/jour</option>
      <option value="decouverte">Offre Découverte — 7€/7 jours</option>
      <option value="quinzaine">Pack 15 Jours — 15€</option>
      <option value="mois">Pack de Bienvenue — 25€/mois</option>
    </select>
    <button class="btn-primary" onclick="generer()">GÉNÉRER LE CODE</button>
    <div class="result-box" id="genResult">
      <div style="color:#C8A882; font-size:12px;">CODE GÉNÉRÉ</div>
      <div class="code-display" id="genCode"></div>
      <div style="color:#888; font-size:12px;" id="genExpiry"></div>
      <button class="btn-copy" onclick="copyCode()">📋 COPIER LE CODE</button>
    </div>
    <div class="msg" id="genMsg"></div>
  </div>

  <div class="main-section" id="listSection" style="display:none;">
    <div class="section-title">👥 Abonnés</div>
    <button class="btn-primary" onclick="lister()" style="margin-bottom:12px;">ACTUALISER LA LISTE</button>
    <button class="btn-primary" onclick="purgerExpires()" style="margin-bottom:12px;background:#FF6B6B;color:#fff;">🗑️ SUPPRIMER LES EXPIRÉS</button>
    <div id="listContainer" style="overflow-x:auto;"></div>
    <div class="msg" id="listMsg"></div>
  </div>

  <footer class="footer">
    <div class="footer-copy">&copy; 2026 Carré Magique Turf - Tous droits réservés</div>
  </footer>
</div>

<script>
const WORKER_URL = '${workerUrl}';
let adminPassword = '';

function login() {
  adminPassword = document.getElementById('adminPass').value;
  if (!adminPassword) return;
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('genSection').style.display = 'block';
  document.getElementById('listSection').style.display = 'block';
  lister();
}

async function generer() {
  const nom = document.getElementById('genNom').value.trim();
  const email = document.getElementById('genEmail').value.trim();
  const pack = document.getElementById('genPack').value;
  const msg = document.getElementById('genMsg');
  const result = document.getElementById('genResult');
  if (!nom) { msg.className = 'msg error'; msg.textContent = 'Nom requis'; return; }
  try {
    const res = await fetch(WORKER_URL + '/api/admin/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword, nom, email, pack })
    });
    const data = await res.json();
    if (data.ok) {
      result.style.display = 'block';
      document.getElementById('genCode').textContent = data.code;
      document.getElementById('genExpiry').textContent = 'Expire le ' + new Date(data.expiration).toLocaleString('fr-FR');
      msg.className = 'msg success'; msg.textContent = '✅ Code généré !';
      document.getElementById('genNom').value = '';
      document.getElementById('genEmail').value = '';
      lister();
    } else { msg.className = 'msg error'; msg.textContent = '❌ ' + data.error; }
  } catch (e) { msg.className = 'msg error'; msg.textContent = '❌ Erreur de connexion'; }
}

function copyCode() {
  const code = document.getElementById('genCode').textContent;
  navigator.clipboard.writeText(code);
  const btn = event.target;
  btn.textContent = '✅ COPIÉ !';
  setTimeout(() => btn.textContent = '📋 COPIER LE CODE', 2000);
}

async function lister() {
  const container = document.getElementById('listContainer');
  const msg = document.getElementById('listMsg');
  try {
    const res = await fetch(WORKER_URL + '/api/admin/list', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword })
    });
    const data = await res.json();
    if (data.ok) {
      if (data.abonnes.length === 0) { container.innerHTML = '<p style="color:#888;text-align:center;">Aucun abonné.</p>'; return; }
      let html = '<table><thead><tr><th>Nom</th><th>Code</th><th>Pack</th><th>Statut</th><th>Appareils</th><th>Expire</th><th>Action</th></tr></thead><tbody>';
      data.abonnes.forEach(a => {
        let statut, badge;
        if (a.expire || !a.actif) { statut = 'Expiré'; badge = 'badge-expire'; }
        else if (a.alerte72h) { statut = '⚠️ 72h'; badge = 'badge-alerte'; }
        else { statut = 'Actif'; badge = 'badge-actif'; }
        let actionBtn = '—';
        if (a.actif && !a.expire) {
          actionBtn = '<button class="btn-red" onclick="revoquer(\\'' + a.code + '\\')">Révoquer</button>';
          if (a.devices.length > 0) {
            actionBtn += ' <button class="btn-red" style="background:#FFB347;color:#000;" onclick="resetDevices(\\'' + a.code + '\\', \\'' + a.nom.replace(/'/g, '') + '\\')">📱 Reset App.</button>';
          }
        } else if (a.expire || !a.actif) {
          actionBtn = '<button class="btn-red" style="background:#888;" onclick="supprimerUn(\\'' + a.code + '\\', this)">🗑️ Supprimer</button>';
        }
        html += '<tr><td>' + a.nom + '</td><td style="font-size:11px;letter-spacing:1px;">' + a.code + '</td><td>' + (a.pack === 'mois' ? 'Mensuel' : 'Jour') + '</td><td><span class="' + badge + '">' + statut + '</span></td><td>' + a.devices.length + '/2</td><td>' + (a.heuresRestantes > 0 ? a.heuresRestantes + 'h' : '—') + '</td><td>' + actionBtn + '</td></tr>';
      });
      html += '</tbody></table>';
      container.innerHTML = html;
    } else { msg.className = 'msg error'; msg.textContent = '❌ ' + data.error; }
  } catch (e) { msg.className = 'msg error'; msg.textContent = '❌ Erreur'; }
}

async function revoquer(code) {
  if (!confirm('Révoquer ' + code + ' ?')) return;
  try {
    const res = await fetch(WORKER_URL + '/api/admin/revoke', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword, code })
    });
    const data = await res.json();
    if (data.ok) lister();
  } catch (e) {}
}

async function resetDevices(code, nom) {
  if (!confirm('Réinitialiser les appareils de ' + nom + ' ? Il devra se reconnecter.')) return;
  try {
    const res = await fetch(WORKER_URL + '/api/admin/reset-devices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword, code })
    });
    const data = await res.json();
    if (data.ok) { alert('✅ ' + data.message); lister(); }
    else { alert('❌ ' + data.error); }
  } catch (e) { alert('❌ Erreur de connexion'); }
}

async function supprimerUn(code, btn) {
  const nom = btn.closest('tr').cells[0].textContent;
  if (!confirm('Supprimer définitivement ' + nom + ' ?')) return;
  try {
    const res = await fetch(WORKER_URL + '/api/admin/purge-one', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword, code })
    });
    const data = await res.json();
    if (data.ok) { alert('✅ ' + nom + ' supprimé.'); lister(); }
    else { alert('❌ ' + data.error); }
  } catch (e) { alert('❌ Erreur de connexion'); }
}

async function purgerExpires() {
  if (!confirm('Supprimer tous les abonnés expirés ? Cette action est irréversible.')) return;
  try {
    const res = await fetch(WORKER_URL + '/api/admin/purge', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword })
    });
    const data = await res.json();
    if (data.ok) {
      alert('✅ ' + data.message);
      lister();
    } else {
      alert('❌ ' + data.error);
    }
  } catch (e) { alert('❌ Erreur de connexion'); }
}

document.getElementById('adminPass').addEventListener('keypress', (e) => { if (e.key === 'Enter') login(); });
</script>
</body>
</html>`;
}

// ============================================================
// ROUTER
// ============================================================

async function handleTaux() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/EUR');
    const data = await res.json();
    if (data && data.rates) {
      data.rates['EUR'] = 1;
      return new Response(JSON.stringify(data.rates), { headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' } });
    }
    throw new Error('invalide');
  } catch (e) {
    try {
      const res2 = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR');
      const data2 = await res2.json();
      data2.rates['EUR'] = 1;
      return new Response(JSON.stringify(data2.rates), { headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' } });
    } catch (e2) {
      return new Response(JSON.stringify({}), { headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' } });
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'OPTIONS') return new Response(null, { headers: getCorsHeaders(request) });
    if (path === '/api/verify' && request.method === 'POST') return handleVerify(request, env);
    if (path === '/api/admin/generate' && request.method === 'POST') return handleGenerate(request, env);
    if (path === '/api/admin/list' && request.method === 'POST') return handleList(request, env);
    if (path === '/api/admin/revoke' && request.method === 'POST') return handleRevoke(request, env);
    if (path === '/api/admin/purge' && request.method === 'POST') return handlePurge(request, env);
    if (path === '/api/admin/purge-one' && request.method === 'POST') return handlePurgeOne(request, env);
    if (path === '/api/admin/reset-devices' && request.method === 'POST') return handleResetDevices(request, env);
    if (path === '/api/taux') return handleTaux();
    const workerUrl = url.origin;
    if (path === '/admin') return new Response(getAdminPage(workerUrl), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    return new Response(getLockedPage(workerUrl), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  },
};
