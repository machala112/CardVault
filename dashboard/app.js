/* ============================================================
   CardValidator — Public validation site (no auth, no signup)
   Customers use a business's share link to validate gift cards.
   All account management happens in the admin mobile app.
   ============================================================ */

// ── Utils ──────────────────────────────────────────────────────
const $       = id => document.getElementById(id);
const sleep   = ms => new Promise(r => setTimeout(r, ms));
const escHtml = s => String(s == null ? '' : s)
  .replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ── API client (same origin, JSON, no auth) ─────────────────────
async function api(path, { method = 'GET', body = null, form = null } = {}) {
  const headers = {};
  let payload = null;
  if (form) {
    payload = form;
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
  try { data = await res.json(); } catch (e) { /* non-JSON */ }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data || {};
}

// ── Router ───────────────────────────────────────────────────────
function currentRoute() {
  const h = location.hash || '#/';
  if (h.startsWith('#/r/')) {
    const token = decodeURIComponent(h.slice(4).split('?')[0]);
    return token ? { name: 'redeem', token } : { name: 'landing' };
  }
  const m = location.pathname.match(/^\/r\/([^\/]+)\/?$/);
  if (m) return { name: 'redeem', token: decodeURIComponent(m[1]) };
  return { name: 'landing' };
}

// ── Templates ────────────────────────────────────────────────────
function landingTpl() {
  // Root domain is intentionally blank — only shared links work.
  return `<div></div>`;
}

function redeemResolvingTpl() {
  return `
    <div class="redeem">
      <div class="redeem-card">
        <p class="please-wait">Loading…</p>
      </div>
    </div>`;
}

function invalidLinkTpl() {
  return `
    <div class="redeem">
      <div class="redeem-card">
        <div class="result-icon">❌</div>
        <h2>Invalid Link</h2>
        <p>This share link is not valid. Please check with the business that sent it.</p>
      </div>
    </div>`;
}

function redeemTpl(ownerName, token) {
  return `
    <div class="redeem">
      <p class="redeem-via">via ${escHtml(ownerName || 'CardValidator')}’s link</p>
      <div class="redeem-card">
        <h2>Validate Your Card</h2>
        <p class="redeem-sub">Enter the code from your gift card or voucher.</p>
        <input id="codeInput" class="code-input" placeholder="Enter card code" autocomplete="off" />
        <label class="img-label">Card photo (optional)
          <input id="imgInput" type="file" accept="image/*" class="img-input" />
        </label>
        <button class="btn-validate" id="validateBtn" type="button">Validate Card</button>
        <div id="loadingArea" class="loading-area hidden">
          <div class="steps" id="steps"></div>
          <p class="please-wait" id="loadingMsg">Please wait…</p>
        </div>
        <div id="resultContent"></div>
      </div>
    </div>`;
}

// ── Render ───────────────────────────────────────────────────────
let renderSeq = 0;

async function render() {
  const seq = ++renderSeq;
  const route = currentRoute();
  const view = $('view');

  // Always anonymous nav — no auth on the public site.
  updateNav();

  if (route.name === 'landing') {
    if (seq !== renderSeq) return;
    view.innerHTML = landingTpl();
    return;
  }

  if (route.name === 'redeem') {
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

function updateNav() {
  const el = $('navStatus');
  if (el) el.innerHTML = '<span class="status-dot"></span><span class="status-text">Live System</span>';
}

// ── Validation flow ──────────────────────────────────────────────
let uploadedFile = null;

function bindRedeem(linkToken) {
  const imgInput = $('imgInput');
  if (imgInput) {
    imgInput.addEventListener('change', () => {
      uploadedFile = imgInput.files && imgInput.files[0] ? imgInput.files[0] : null;
    });
  }
  $('validateBtn').addEventListener('click', () => startValidation(linkToken));
  $('againBtn')?.addEventListener('click', () => render());
}

function setStep(n, cls) {
  const steps = $('steps');
  if (!steps) return;
  // Simple step indicator
  steps.innerHTML = ['Upload', 'Read', 'Check', 'Done'].map((s, i) =>
    `<div class="step ${i < n ? 'done' : ''} ${i === n ? 'active' : ''}">${s}</div>`
  ).join('');
}

async function startValidation(linkToken) {
  const code = ($('codeInput').value || '').trim();
  if (!code) {
    showResult('invalid', '', 'Please enter a card code.');
    return;
  }
  $('loadingArea').classList.remove('hidden');
  $('resultContent').innerHTML = '';

  try {
    // 1. Upload image first (only if one was chosen)
    let imageUrl = null;
    setStep(1, 'active');
    $('loadingMsg').textContent = uploadedFile ? 'Uploading card image…' : 'Skipping image upload…';
    if (uploadedFile) {
      try {
        const fd = new FormData();
        fd.append('image', uploadedFile);
        fd.append('link_token', linkToken);
        const up = await api('/api/upload', { method: 'POST', form: fd });
        imageUrl = up.image_url;
      } catch (uploadErr) {
        console.warn('Image upload skipped:', uploadErr.message);
        imageUrl = null;
      }
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
    $('loadingArea').classList.add('hidden');
    showResult(result.status, result.code || code);
  } catch (err) {
    console.error(err);
    $('loadingArea').classList.add('hidden');
    showResult('error', code, err.message);
  }
}

function showResult(status, code, errMsg) {
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
    '<p class="result-msg">' + escHtml(c.msg) + '</p>' +
    '<button class="btn-validate" id="againBtn" type="button" style="margin-top:24px">Validate Another Card</button>';
  $('againBtn').addEventListener('click', () => render());
}

// ── Boot ─────────────────────────────────────────────────────────
window.addEventListener('hashchange', render);
document.addEventListener('DOMContentLoaded', render);
