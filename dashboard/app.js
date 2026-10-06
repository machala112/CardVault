/* ============================================================
   CardValidator — Dashboard SPA (vanilla JS, no build step)
   Hash router · Worker API backend · FCM-ready
   ============================================================ */

// ── Utils ──────────────────────────────────────────────────────
const $       = id => document.getElementById(id);
const sleep   = ms => new Promise(r => setTimeout(r, ms));
const escHtml = s => String(s == null ? '' : s)
  .replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ── Session (Firebase Auth; user profile cached in localStorage for display) ─
const USER_KEY  = 'cv_user';
const getUser   = () => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch(e){ return null; } };
const setUser   = u => localStorage.setItem(USER_KEY, JSON.stringify(u));
const clearUser = () => localStorage.removeItem(USER_KEY);
const fbAuth    = () => firebase.auth();

// ── API client (same origin, JSON, Bearer auth) ───────────────────
async function api(path, { method = 'GET', body = null, form = null, auth = false } = {}) {
  const headers = {};
  if (auth) {
    const fbUser = fbAuth().currentUser;
    if (!fbUser) throw new Error('You are signed out. Please sign in again.');
    headers['Authorization'] = 'Bearer ' + await fbUser.getIdToken(); // auto-refreshes when expired
  }
  let payload = null;
  if (form) {
    payload = form; // FormData — browser sets the multipart boundary
  } else if (body != null) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, { method, headers, body: payload });
  } catch (e) {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON body */ }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data || {};
}

// ── Router ───────────────────────────────────────────────────────
let renderSeq = 0;

function currentRoute() {
  const h = location.hash || '#/';
  if (h === '#/app') return { name: 'app' };
  if (h.startsWith('#/r/')) {
    const token = decodeURIComponent(h.slice(4).split('?')[0]);
    return token ? { name: 'redeem', token } : { name: 'landing' };
  }
  // Support path-style shared links in case the server serves the SPA at /r/<token>
  const m = location.pathname.match(/^\/r\/([^\/]+)\/?$/);
  if (m) return { name: 'redeem', token: decodeURIComponent(m[1]) };
  return { name: 'landing' };
}

async function render() {
  const seq = ++renderSeq;
  const route = currentRoute();
  const view = $('view');

  if (route.name === 'landing') {
    // Already signed in via Firebase? Bounce straight to the app.
    if (fbAuth().currentUser) {
      location.hash = '#/app';
      return;
    }
    if (seq !== renderSeq) return;
    updateNav(null);
    view.innerHTML = landingTpl();
    bindLanding();
    return;
  }

  if (route.name === 'app') {
    if (!fbAuth().currentUser) {
      clearUser(); updateNav(null);
      location.hash = '#/';
      return;
    }
    let me;
    try {
      me = await api('/api/auth/me', { auth: true });
    } catch (e) {
      clearUser(); updateNav(null);
      location.hash = '#/';
      return;
    }
    if (seq !== renderSeq) return;
    setUser(me.user); updateNav(me.user);
    view.innerHTML = appTpl(me.user);
    bindApp();
    // Load the permanent share link
    try {
      const { link } = await api('/api/links/mine', { auth: true });
      if (seq !== renderSeq) return;
      const box = $('linkBox');
      box.classList.remove('loading');
      box.textContent = link || 'No link returned — please try again.';
    } catch (e) {
      if (seq !== renderSeq) return;
      const box = $('linkBox');
      box.classList.remove('loading');
      box.textContent = 'Could not load your link: ' + e.message;
    }
    return;
  }

  if (route.name === 'redeem') {
    updateNav(getUser());
    view.innerHTML = redeemResolvingTpl();
    let res;
    try {
      res = await api('/api/links/resolve?token=' + encodeURIComponent(route.token));
    } catch (e) {
      res = { valid: false };
    }
    if (seq !== renderSeq) return;
    if (!res || !res.valid) {
      view.innerHTML = invalidLinkTpl();
    } else {
      view.innerHTML = redeemTpl(res.owner_name, route.token);
      bindRedeem(route.token);
    }
    return;
  }
}

window.addEventListener('hashchange', render);

// ── Navbar ───────────────────────────────────────────────────────
function updateNav(user) {
  const el = $('navStatus');
  if (user && user.email) {
    el.innerHTML =
      '<div class="nav-user">' +
        '<span class="status-dot"></span>' +
        '<span class="user-email">' + escHtml(user.email) + '</span>' +
        '<button class="link-signout" id="navSignout">Sign out</button>' +
      '</div>';
    $('navSignout').addEventListener('click', doSignout);
  } else {
    el.innerHTML = '<span class="status-dot"></span><span class="status-text">Live System</span>';
  }
}

async function doSignout() {
  try { await fbAuth().signOut(); } catch (e) { /* best effort */ }
  clearUser(); updateNav(null);
  location.hash = '#/';
}

// ── Templates ────────────────────────────────────────────────────
function landingTpl() {
  return `
  <section class="hero">
    <div class="hero-badge glass-chip"><span class="chip-dot"></span>Instant Card Verification</div>
    <h1 class="hero-title">Validate Your<br/><span class="gradient-text">Gift Card</span></h1>
    <p class="hero-sub">Sign in or create a free account to get your personal share link — then anyone with your link can verify cards instantly.</p>
  </section>
  <div class="main-container">
    <div class="validator-card mirror-glass">
      <div class="auth-tabs">
        <button class="auth-tab active" id="tabSignin" type="button">Sign In</button>
        <button class="auth-tab" id="tabSignup" type="button">Sign Up</button>
      </div>
      <div id="authError" class="form-error hidden"></div>
      <form id="signinForm" class="auth-form" novalidate>
        <div class="form-field">
          <label for="siEmail">Email</label>
          <input type="email" id="siEmail" class="form-input" placeholder="you@example.com" autocomplete="email" />
        </div>
        <div class="form-field">
          <label for="siPass">Password</label>
          <input type="password" id="siPass" class="form-input" placeholder="••••••••" autocomplete="current-password" />
        </div>
        <button class="btn-validate liquid-glass" type="submit"><span class="btn-text">Sign In</span></button>
      </form>
      <form id="signupForm" class="auth-form hidden" novalidate>
        <div class="form-field">
          <label for="suName">Name</label>
          <input type="text" id="suName" class="form-input" placeholder="Your name or business" autocomplete="name" />
        </div>
        <div class="form-field">
          <label for="suEmail">Email</label>
          <input type="email" id="suEmail" class="form-input" placeholder="you@example.com" autocomplete="email" />
        </div>
        <div class="form-field">
          <label for="suPass">Password <span class="field-hint">(min 8 characters)</span></label>
          <input type="password" id="suPass" class="form-input" placeholder="••••••••" autocomplete="new-password" />
        </div>
        <button class="btn-validate liquid-glass" type="submit"><span class="btn-text">Create Account</span></button>
      </form>
    </div>
  </div>`;
}

function appTpl(user) {
  return `
  <section class="hero slim">
    <div class="hero-badge glass-chip"><span class="chip-dot"></span>Welcome back</div>
    <h1 class="hero-title">Your <span class="gradient-text">Share Link</span></h1>
  </section>
  <div class="main-container">
    <div class="validator-card mirror-glass">
      <div class="step-header">
        <div class="step-num">∞</div>
        <div>
          <h2 class="step-title">My permanent link</h2>
          <p class="step-desc">One link per account — it always works</p>
        </div>
      </div>
      <div class="link-box loading" id="linkBox">Loading your link…</div>
      <div class="link-actions">
        <button class="btn-validate liquid-glass btn-half" id="copyBtn" type="button"><span class="btn-text">Copy Link</span></button>
        <button class="btn-ghost btn-half" id="regenBtn" type="button"><span class="btn-text">Regenerate</span></button>
      </div>
      <div class="note-box">
        Anyone with this link can validate cards through it — no account needed on their side.
        Share it with your customers. If it ever falls into the wrong hands, hit
        <b>Regenerate</b> and the old link stops working instantly.
      </div>
      <div class="user-row">
        <span class="user-email">${escHtml(user.email)}</span>
        <button class="link-signout" id="signoutBtn" type="button">Sign out</button>
      </div>
    </div>
  </div>`;
}

function redeemResolvingTpl() {
  return `
  <section class="hero slim">
    <div class="hero-badge glass-chip"><span class="chip-dot"></span>Shared Validation Link</div>
    <h1 class="hero-title">Checking <span class="gradient-text">Link</span></h1>
  </section>
  <div class="main-container">
    <div class="validator-card mirror-glass">
      <div class="loading-center">
        <div class="spiral-loader-wrap"><div class="spiral-loader">
          <div class="spiral-ring ring-1"></div><div class="spiral-ring ring-2"></div>
          <div class="spiral-ring ring-3"></div><div class="spiral-core"></div>
        </div></div>
        <p class="loading-sub">Verifying this share link…</p>
      </div>
    </div>
  </div>`;
}

function invalidLinkTpl() {
  return `
  <section class="hero slim">
    <div class="hero-badge glass-chip"><span class="chip-dot"></span>Shared Validation Link</div>
    <h1 class="hero-title">Link <span class="gradient-text">Not Found</span></h1>
  </section>
  <div class="main-container">
    <div class="validator-card mirror-glass">
      <div class="result-center">
        <div class="result-icon invalid">❌</div>
        <h2 class="result-title invalid">Invalid Link</h2>
        <p class="result-msg">This share link doesn't exist or is no longer active. Ask the owner for a fresh one.</p>
      </div>
    </div>
  </div>`;
}

function redeemTpl(ownerName, token) {
  return `
  <section class="hero slim">
    <div class="hero-badge glass-chip"><span class="chip-dot"></span>Shared Validation Link</div>
    <h1 class="hero-title">Validate a <span class="gradient-text">Gift Card</span></h1>
    <p class="hero-sub">via ${escHtml(ownerName)}'s link</p>
  </section>
  <div class="main-container">
    <div class="validator-card mirror-glass" id="validatorCard">

      <div class="step" id="stepUpload">
        <div class="step-header">
          <div class="step-num">01</div>
          <div>
            <h2 class="step-title">Upload Card Image <span class="field-hint">(optional)</span></h2>
            <p class="step-desc">Take a clear photo of the gift card</p>
          </div>
        </div>

        <div class="upload-zone" id="uploadZone">
          <input type="file" id="fileInput" accept="image/*" hidden />
          <div class="upload-idle" id="uploadIdle">
            <div class="upload-icon-wrap glass-chip">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p class="upload-label">Drag &amp; drop or <button class="upload-browse" id="browseBtn" type="button">browse</button></p>
            <p class="upload-hint">PNG, JPG, WEBP — max 10 MB</p>
          </div>
          <div class="upload-preview hidden" id="uploadPreview">
            <img id="previewImg" src="" alt="Card preview" />
            <button class="remove-img glass-chip" id="removeImg" type="button">✕ Remove</button>
          </div>
        </div>

        <div class="step-header" style="margin-top:28px">
          <div class="step-num">02</div>
          <div>
            <h2 class="step-title">Enter Card Code</h2>
            <p class="step-desc">Type or paste the code exactly as printed</p>
          </div>
        </div>

        <div class="code-input-wrap" id="codeWrap">
          <div class="code-prefix">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="5" y="11" width="14" height="10" rx="2"/>
              <path d="M8 11V7a4 4 0 018 0v4"/>
            </svg>
          </div>
          <input type="text" id="codeInput" class="code-input" placeholder="e.g. CARD-ALPHA-001"
                 autocomplete="off" spellcheck="false" />
        </div>

        <button class="btn-validate liquid-glass" id="validateBtn" type="button">
          <span class="btn-text">Validate Card</span>
          <svg class="btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>

        <p class="privacy-note">
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1l6 2.5v4C14 11.5 11.5 14.5 8 15 4.5 14.5 2 11.5 2 7.5v-4L8 1z"/>
          </svg>
          Your data is encrypted and stored securely.
        </p>
      </div>

      <div class="step hidden" id="stepLoading">
        <div class="loading-center">
          <div class="spiral-loader-wrap"><div class="spiral-loader">
            <div class="spiral-ring ring-1"></div><div class="spiral-ring ring-2"></div>
            <div class="spiral-ring ring-3"></div><div class="spiral-core"></div>
          </div></div>
          <h2 class="loading-title">Validating Your Card</h2>
          <p class="loading-sub" id="loadingMsg">Connecting to verification server...</p>
          <div class="loading-steps">
            <div class="ls-item" id="ls1"><span class="ls-dot"></span> Uploading image</div>
            <div class="ls-item" id="ls2"><span class="ls-dot"></span> Reading card code</div>
            <div class="ls-item" id="ls3"><span class="ls-dot"></span> Verifying with database</div>
            <div class="ls-item" id="ls4"><span class="ls-dot"></span> Finalizing result</div>
          </div>
          <p class="please-wait">Please wait while we validate your card…</p>
        </div>
      </div>

      <div class="step hidden" id="stepResult">
        <div class="result-center" id="resultContent"></div>
        <button class="btn-validate liquid-glass" style="margin-top:32px" id="againBtn" type="button">
          <span class="btn-text">Validate Another Card</span>
        </button>
      </div>

    </div>
  </div>`;
}

// ── Landing bindings ─────────────────────────────────────────────
function showAuthError(msg) {
  const el = $('authError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function bindLanding() {
  const tabIn = $('tabSignin'), tabUp = $('tabSignup');
  const formIn = $('signinForm'), formUp = $('signupForm');

  function selectTab(which) {
    const isIn = which === 'signin';
    tabIn.classList.toggle('active', isIn);
    tabUp.classList.toggle('active', !isIn);
    formIn.classList.toggle('hidden', !isIn);
    formUp.classList.toggle('hidden', isIn);
    $('authError').classList.add('hidden');
  }
  tabIn.addEventListener('click', () => selectTab('signin'));
  tabUp.addEventListener('click', () => selectTab('signup'));

  formIn.addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('siEmail').value.trim();
    const password = $('siPass').value;
    if (!email || !password) { showAuthError('Please enter your email and password.'); return; }
    try {
      await fbAuth().signInWithEmailAndPassword(email, password);
      // onAuthStateChanged takes it from here (sync + route to #/app)
    } catch (err) { showAuthError(err.message || 'Sign in failed.'); }
  });

  formUp.addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('suName').value.trim();
    const email = $('suEmail').value.trim();
    const password = $('suPass').value;
    if (!name) { showAuthError('Please enter your name.'); return; }
    if (!email) { showAuthError('Please enter your email address.'); return; }
    if (password.length < 8) { showAuthError('Password must be at least 8 characters.'); return; }
    try {
      const cred = await fbAuth().createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: name });
      // onAuthStateChanged takes it from here (sync + route to #/app)
    } catch (err) { showAuthError(err.message || 'Sign up failed.'); }
  });
}

// ── App (share link) bindings ──────────────────────────────────────
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_e) { /* noop */ }
    ta.remove();
    return ok;
  }
}

function bindApp() {
  $('copyBtn').addEventListener('click', async () => {
    const link = $('linkBox').textContent.trim();
    if (!link || $('linkBox').classList.contains('loading')) return;
    const btn = $('copyBtn').querySelector('.btn-text');
    const ok = await copyText(link);
    btn.textContent = ok ? 'Copied ✓' : 'Copy failed — long-press the link';
    setTimeout(() => { btn.textContent = 'Copy Link'; }, 2200);
  });

  $('regenBtn').addEventListener('click', async () => {
    if (!window.confirm('Regenerate your share link? The current link will stop working immediately.')) return;
    const btn = $('regenBtn').querySelector('.btn-text');
    btn.textContent = 'Working…';
    try {
      const { link } = await api('/api/links/regenerate', { method: 'POST', auth: true });
      $('linkBox').textContent = link || 'No link returned — please try again.';
      btn.textContent = 'Regenerated ✓';
    } catch (e) {
      btn.textContent = 'Regenerate';
      window.alert('Could not regenerate: ' + e.message);
      return;
    }
    setTimeout(() => { btn.textContent = 'Regenerate'; }, 2200);
  });

  $('signoutBtn').addEventListener('click', doSignout);
}

// ── Redeem (public validation) bindings ────────────────────────────
let uploadedFile = null;

function bindRedeem(linkToken) {
  uploadedFile = null;
  const zone = $('uploadZone'), input = $('fileInput');

  function setFile(file) {
    if (!file.type.startsWith('image/')) { window.alert('Please choose an image file.'); return; }
    if (file.size > 10 * 1024 * 1024) { window.alert('Image is larger than 10 MB.'); return; }
    uploadedFile = file;
    $('previewImg').src = URL.createObjectURL(file);
    $('uploadIdle').classList.add('hidden');
    $('uploadPreview').classList.remove('hidden');
  }
  function clearFile() {
    uploadedFile = null;
    $('previewImg').src = '';
    input.value = '';
    $('uploadIdle').classList.remove('hidden');
    $('uploadPreview').classList.add('hidden');
  }

  zone.addEventListener('click', e => {
    if (e.target.closest('#removeImg')) return;
    if (!uploadedFile) input.click();
  });
  $('browseBtn').addEventListener('click', e => { e.stopPropagation(); input.click(); });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setFile(f);
  });
  input.addEventListener('change', () => { if (input.files[0]) setFile(input.files[0]); });
  $('removeImg').addEventListener('click', e => { e.stopPropagation(); clearFile(); });

  $('validateBtn').addEventListener('click', () => startValidation(linkToken));
  $('againBtn').addEventListener('click', () => render()); // re-render the same route
}

function shakeInput() {
  const wrap = $('codeWrap');
  wrap.style.animation = 'none';
  void wrap.offsetHeight; // reflow
  wrap.style.animation = 'shake 0.4s ease';
  setTimeout(() => { wrap.style.animation = ''; }, 400);
  $('codeInput').focus();
}

function setStep(n, state) {
  const el = $('ls' + n);
  if (!el) return;
  el.classList.remove('active', 'done');
  if (state) el.classList.add(state);
}

async function startValidation(linkToken) {
  const code = $('codeInput').value.trim();
  if (!code) { shakeInput(); return; }

  $('stepUpload').classList.add('hidden');
  $('stepResult').classList.add('hidden');
  $('stepLoading').classList.remove('hidden');
  [1, 2, 3, 4].forEach(n => setStep(n, null));

  try {
    // 1. Upload image first (only if one was chosen)
    let imageUrl = null;
    setStep(1, 'active');
    $('loadingMsg').textContent = uploadedFile ? 'Uploading card image…' : 'Skipping image upload…';
    if (uploadedFile) {
      const fd = new FormData();
      fd.append('image', uploadedFile);
      fd.append('link_token', linkToken);
      const up = await api('/api/upload', { method: 'POST', form: fd });
      imageUrl = up.image_url;
    }
    await sleep(400);
    setStep(1, 'done');

    // 2-3. Validate the code
    setStep(2, 'active');
    $('loadingMsg').textContent = 'Reading card code…';
    await sleep(500);
    setStep(2, 'done');
    setStep(3, 'active');
    $('loadingMsg').textContent = 'Checking database…';
    const body = { code, link_token: linkToken };
    if (imageUrl) body.image_url = imageUrl;
    const result = await api('/api/validate', { method: 'POST', body });
    setStep(3, 'done');

    // 4. Finalize
    setStep(4, 'active');
    $('loadingMsg').textContent = 'Finalizing result…';
    await sleep(500);
    setStep(4, 'done');
    await sleep(300);
    showResult(result.status, result.code);
  } catch (err) {
    console.error(err);
    showResult('error', code, err.message);
  }
}

function showResult(status, code, errMsg) {
  $('stepLoading').classList.add('hidden');
  $('stepResult').classList.remove('hidden');

  const configs = {
    valid: {
      icon: '✅', cls: 'valid',
      title: 'Card Verified!',
      msg: 'This gift card is valid and ready to use. Enjoy!',
    },
    used: {
      icon: '⚠️', cls: 'used',
      title: 'Already Used',
      msg: 'This card has already been redeemed. If you believe this is an error, please contact support.',
    },
    invalid: {
      icon: '❌', cls: 'invalid',
      title: 'Invalid Code',
      msg: "We couldn't find this card code in the system. Please double-check and try again.",
    },
    error: {
      icon: '⚡', cls: 'invalid',
      title: 'Connection Error',
      msg: errMsg || 'Something went wrong. Please check your connection and try again.',
    },
  };
  const c = configs[status] || configs.invalid;

  $('resultContent').innerHTML =
    '<div class="result-icon ' + c.cls + '">' + c.icon + '</div>' +
    '<h2 class="result-title ' + c.cls + '">' + c.title + '</h2>' +
    '<div class="result-code">' + escHtml(code) + '</div>' +
    '<p class="result-msg">' + escHtml(c.msg) + '</p>';
}

// ── Animated background canvas ───────────────────────────────────
(function initCanvas() {
  const canvas = $('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x  = Math.random() * W;
      this.y  = Math.random() * H;
      this.r  = Math.random() * 1.5 + 0.3;
      this.vx = (Math.random() - 0.5) * 0.15;
      this.vy = (Math.random() - 0.5) * 0.15;
      this.a  = Math.random() * 0.5 + 0.1;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.x < 0 || this.x > W || this.y < 0 || this.y > H) this.reset();
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(180,170,255,' + this.a + ')';
      ctx.fill();
    }
  }

  for (let i = 0; i < 120; i++) particles.push(new Particle());

  function frame() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) { p.update(); p.draw(); }
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 80) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = 'rgba(124,109,250,' + (0.08 * (1 - d / 80)) + ')';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(frame);
  }
  frame();
})();

// ── Inject shake keyframe ──────────────────────────────────────
(function injectShake() {
  const style = document.createElement('style');
  style.textContent = `
@keyframes shake {
  0%,100% { transform: translateX(0); }
  20%     { transform: translateX(-6px); }
  40%     { transform: translateX(6px); }
  60%     { transform: translateX(-4px); }
  80%     { transform: translateX(4px); }
}`;
  document.head.appendChild(style);
})();

// ── Firebase boot + auth state routing ──────────────────────────
function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash; // fires hashchange → render
}

async function syncWithServer(fbUser) {
  const idToken = await fbUser.getIdToken();
  const res = await fetch('/api/auth/sync', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + idToken },
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON */ }
  if (!res.ok) throw new Error((data && data.error) || 'Account sync failed');
  return data; // { user, link }
}

async function boot() {
  // 1. Load public Firebase web config from the Worker (no keys hardcoded).
  let cfg;
  try {
    cfg = await api('/api/config');
  } catch (e) {
    $('view').innerHTML =
      '<div class="main-container"><div class="validator-card mirror-glass">' +
      '<div class="result-center"><div class="result-icon invalid">⚡</div>' +
      '<h2 class="result-title invalid">Could not load</h2>' +
      '<p class="result-msg">Failed to load app configuration: ' + escHtml(e.message) + '</p>' +
      '</div></div></div>';
    return;
  }
  if (!cfg || !cfg.apiKey || !cfg.authDomain || !cfg.projectId) {
    console.error('Invalid /api/config response', cfg);
    $('view').innerHTML =
      '<div class="main-container"><div class="validator-card mirror-glass">' +
      '<div class="result-center"><div class="result-icon invalid">⚡</div>' +
      '<h2 class="result-title invalid">Misconfigured</h2>' +
      '<p class="result-msg">The server did not return a valid Firebase configuration.</p>' +
      '</div></div></div>';
    return;
  }

  // 2. Init Firebase Auth.
  firebase.initializeApp(cfg);

  // 3. One handler owns post-sign-in sync + routing; it also fires on page
  //    load when a Firebase session already exists.
  fbAuth().onAuthStateChanged(async fbUser => {
    if (fbUser) {
      try {
        const { user } = await syncWithServer(fbUser);
        setUser(user); updateNav(user);
      } catch (e) {
        console.error('Auth sync failed:', e);
        // Still route; the app route will surface the error via /api/auth/me.
      }
      // Public share links work without touching auth state.
      if (currentRoute().name !== 'redeem') go('#/app');
      else render();
    } else {
      clearUser(); updateNav(null);
      const name = currentRoute().name;
      if (name === 'app') go('#/');
      else render();
    }
  });
}

boot();
