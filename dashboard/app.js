/* ============================================================
   CardValidator — Frontend Logic
   Cloudflare Worker API · Share-link validation (#/r/<token>)
   ============================================================ */

// ── API helper ────────────────────────────────────────────────
async function api(path, { method = 'GET', body = null, form = null } = {}) {
  const opts = { method, headers: {} };
  if (form) {
    opts.body = form; // FormData — browser sets Content-Type
  } else if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Route: #/r/<token> ────────────────────────────────────────
function getRoute() {
  const h = location.hash || '';
  const m = h.match(/^#\/r\/([A-Za-z0-9_-]+)/);
  if (m) return { name: 'redeem', token: m[1] };
  return { name: 'landing' }; // root → blank
}

// ── State ─────────────────────────────────────────────────────
let uploadedFile = null;
let linkToken = null;

// ── DOM refs ──────────────────────────────────────────────────
const uploadZone    = document.getElementById('uploadZone');
const fileInput     = document.getElementById('fileInput');
const uploadIdle    = document.getElementById('uploadIdle');
const uploadPreview = document.getElementById('uploadPreview');
const previewImg    = document.getElementById('previewImg');
const removeImg     = document.getElementById('removeImg');
const codeInput     = document.getElementById('codeInput');
const stepUpload    = document.getElementById('stepUpload');
const stepLoading   = document.getElementById('stepLoading');
const stepResult    = document.getElementById('stepResult');
const resultContent = document.getElementById('resultContent');
const loadingMsg    = document.getElementById('loadingMsg');
const ls            = [null,'ls1','ls2','ls3','ls4'].map(id => id && document.getElementById(id));

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
window.addEventListener('hashchange', init);

async function init() {
  const route = getRoute();

  if (route.name === 'landing') {
    // Root: completely blank — only shared links work.
    document.body.style.display = 'none';
    document.title = '';
    return;
  }
  document.body.style.display = '';
  document.title = 'CardValidator — Verify Your Card';

  // Resolve the share link
  linkToken = route.token;
  let res;
  try {
    res = await api('/api/links/resolve?token=' + encodeURIComponent(linkToken));
  } catch (e) {
    res = { valid: false };
  }
  if (!res || !res.valid) {
    showResult('error', '', 'This link is invalid or has expired.');
    stepUpload.classList.add('hidden');
    return;
  }
  // Show owner name if there's a spot for it
  const ownerEl = document.getElementById('ownerName');
  if (ownerEl && res.owner_name) ownerEl.textContent = res.owner_name;
}

// ── Upload zone setup ─────────────────────────────────────────

// Browse button — direct trigger (most reliable on mobile)
const uploadBrowseBtn = document.getElementById('uploadBrowseBtn');
if (uploadBrowseBtn) {
  uploadBrowseBtn.addEventListener('click', e => {
    e.stopPropagation();
    fileInput.click();
  });
}

// Clicking anywhere in the zone (but not Remove) also opens picker
uploadZone.addEventListener('click', e => {
  if (removeImg && (e.target === removeImg || removeImg.contains(e.target))) return;
  fileInput.click();
});

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) setFile(f);
});

fileInput.addEventListener('change', () => {
  const f = fileInput.files && fileInput.files[0];
  if (f) setFile(f);
});

removeImg.addEventListener('click', e => {
  e.stopPropagation();
  clearFile();
});

function setFile(file) {
  uploadedFile = file;
  const url = URL.createObjectURL(file);
  previewImg.src = url;
  uploadIdle.classList.add('hidden');
  uploadPreview.classList.remove('hidden');
}

function clearFile() {
  uploadedFile = null;
  fileInput.value = '';
  uploadIdle.classList.remove('hidden');
  uploadPreview.classList.add('hidden');
}

// ── Validation ────────────────────────────────────────────────
async function startValidation() {
  const code = codeInput.value.trim();
  if (!code) {
    shakeInput();
    return;
  }
  if (!linkToken) {
    showResult('error', code, 'Invalid share link.');
    return;
  }

  // Switch to loading step
  stepUpload.classList.add('hidden');
  stepLoading.classList.remove('hidden');
  stepResult.classList.add('hidden');

  // Animate loading steps
  const steps = [
    { el: ls[1], msg: 'Uploading card image…',         delay: 0    },
    { el: ls[2], msg: 'Reading card code…',             delay: 900  },
    { el: ls[3], msg: 'Checking database…',             delay: 1800 },
    { el: ls[4], msg: 'Finalizing result…',             delay: 2700 },
  ];

  for (const s of steps) {
    setTimeout(() => {
      steps.filter(x => x.el !== s.el).forEach(x => {
        if (x.el) x.el.classList.remove('active');
      });
      if (s.el) s.el.classList.add('active');
      loadingMsg.textContent = s.msg;
    }, s.delay);
  }

  try {
    // 1. Upload image (or skip if none)
    let imageUrl = null;
    if (uploadedFile) {
      try {
        const fd = new FormData();
        fd.append('image', uploadedFile);
        fd.append('link_token', linkToken);
        const up = await api('/api/upload', { method: 'POST', form: fd });
        imageUrl = up.image_url || null;
      } catch (uploadErr) {
        console.warn('Image upload skipped:', uploadErr.message);
      }
    }
    if (ls[1]) { ls[1].classList.remove('active'); ls[1].classList.add('done'); }

    // 2. Validate via Cloudflare API
    const body = { code, link_token: linkToken };
    if (imageUrl) body.image_url = imageUrl;
    const result = await api('/api/validate', { method: 'POST', body });
    if (ls[2]) { ls[2].classList.remove('active'); ls[2].classList.add('done'); }
    if (ls[3]) { ls[3].classList.remove('active'); ls[3].classList.add('done'); }

    await sleep(600);
    if (ls[4]) { ls[4].classList.remove('active'); ls[4].classList.add('done'); }

    await sleep(400);
    showResult(result.status, result.code || code);

  } catch (err) {
    console.error(err);
    showResult('error', code, err.message);
  }
}

function showResult(status, code, errMsg) {
  stepLoading.classList.add('hidden');
  stepResult.classList.remove('hidden');

  const configs = {
    valid: {
      icon:  '✅',
      cls:   'valid',
      title: 'Card Verified!',
      msg:   'Your gift card is valid and ready to use. Enjoy!',
    },
    used: {
      icon:  '⚠️',
      cls:   'used',
      title: 'Already Used',
      msg:   'This card has already been redeemed. If you believe this is an error, please contact support.',
    },
    invalid: {
      icon:  '❌',
      cls:   'invalid',
      title: 'Invalid Code',
      msg:   'We couldn\'t find this card code in our system. Please double-check and try again.',
    },
    error: {
      icon:  '⚡',
      cls:   'invalid',
      title: 'Connection Error',
      msg:   errMsg || 'Something went wrong. Please check your connection and try again.',
    },
  };

  const c = configs[status] || configs.invalid;

  resultContent.innerHTML = `
    <div class="result-icon ${c.cls}">${c.icon}</div>
    <h2 class="result-title ${c.cls}">${c.title}</h2>
    <div class="result-code">${escHtml(code)}</div>
    <p class="result-msg">${c.msg}</p>
  `;
}

function resetForm() {
  stepResult.classList.add('hidden');
  stepLoading.classList.add('hidden');
  stepUpload.classList.remove('hidden');
  clearFile();
  codeInput.value = '';
  ls.filter(Boolean).forEach(el => el.classList.remove('active','done'));
}

function shakeInput() {
  const wrap = codeInput.closest('.code-input-wrap');
  if (!wrap) return;
  wrap.style.animation = 'none';
  wrap.offsetHeight; // reflow
  wrap.style.animation = 'shake 0.4s ease';
  setTimeout(() => wrap.style.animation = '', 400);
}
