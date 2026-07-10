// BlueVerse Studio — homepage interactions
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const toast = $('#toast');
function showToast(t) {
  if (!toast) return;
  toast.textContent = t;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

// mobile menu
$('#menuBtn')?.addEventListener('click', () => $('#links')?.classList.toggle('open'));
$$('#links a').forEach(a => a.addEventListener('click', () => $('#links')?.classList.remove('open')));

// search placeholder
$('#searchBtn')?.addEventListener('click', () =>
  showToast('Search coming soon — projects, books, and prompts.'));

// in-card tab switching
$$('.tabs').forEach(group => {
  group.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('button').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
    });
  });
});

// copy-to-clipboard on contact rows
$$('.contact a[data-copy]').forEach(a => {
  a.addEventListener('click', async e => {
    e.preventDefault();
    const v = a.dataset.copy;
    try { await navigator.clipboard.writeText(v); showToast(`${v} copied.`); }
    catch { showToast(v); }
  });
});

// homepage AI mock chat
$('#homeAsk')?.addEventListener('submit', e => {
  e.preventDefault();
  const input = e.target.querySelector('input');
  const v = input.value.trim();
  if (!v) return;
  addBubble(v, 'you');
  input.value = '';
  setTimeout(() => addBubble('Signal received. In the live version this connects to your AI backend.', 'bot'), 450);
});
function addBubble(text, who) {
  const chat = $('#homeChat');
  if (!chat) return;
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + who;
  if (who === 'bot') {
    wrap.innerHTML = `<span class="who"></span><div><div class="name">BlueVerse AI</div><div class="bub"></div></div>`;
    wrap.querySelector('.bub').textContent = text;
  } else {
    wrap.innerHTML = `<div class="bub"></div>`;
    wrap.querySelector('.bub').textContent = text;
  }
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
}

// focus timer
let sec = 45 * 60, running = false, timer = null;
function renderTimer() {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  const el = $('#focusTime');
  if (el) el.textContent = `${m}:${s}`;
}
$('#focusBtn')?.addEventListener('click', () => {
  const btn = $('#focusBtn');
  if (!running) {
    running = true; btn.textContent = 'Pause Focus';
    timer = setInterval(() => {
      sec = Math.max(0, sec - 1); renderTimer();
      if (sec === 0) { clearInterval(timer); running = false; btn.textContent = 'Restart Focus'; showToast('Focus session complete.'); sec = 45 * 60; }
    }, 1000);
  } else {
    running = false; clearInterval(timer); btn.textContent = 'Resume Focus';
  }
});

// live studio clock
function clock() {
  const now = new Date();
  const t = $('#studioTime'), d = $('#studioDate');
  if (t) t.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d) d.textContent = now.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}
clock();
setInterval(clock, 15000);

// scroll-spy nav highlight
const spySections = $$('main [id]');
const spyLinks = $$('#links a[href^="#"]');
if (spySections.length) {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      spyLinks.forEach(a => a.classList.remove('active'));
      $(`#links a[href="#${e.target.id}"]`)?.classList.add('active');
    });
  }, { threshold: .4 });
  spySections.forEach(s => obs.observe(s));
}

// subtle creative-flow flicker
setInterval(() => {
  const el = $('#flow');
  if (el) el.textContent = Math.floor(88 + Math.random() * 10) + '%';
}, 6000);
