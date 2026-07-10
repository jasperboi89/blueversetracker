// The Nexus — dashboard interactions
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const toast = $('#toast');
function showToast(t) {
  if (!toast) return;
  toast.textContent = t;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

// sidebar active state
$$('.nx-nav a').forEach(a => {
  a.addEventListener('click', e => {
    if (a.getAttribute('href') === '#') e.preventDefault();
    $$('.nx-nav a').forEach(x => x.classList.remove('active'));
    a.classList.add('active');
  });
});

// New Chat mock
$('#newChat')?.addEventListener('click', () =>
  showToast('New chat started with Liam AI.'));

// vault / tool / feed placeholders
$$('.vrow, .tool, .console-btns .open, .chips button').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    showToast('Opening in the full Nexus app…');
  });
});
$('.vault-panel .access')?.addEventListener('click', () =>
  showToast('Archive is encrypted — unlocking…'));

// search placeholder
$('.nx-search input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); showToast('Search across The Nexus coming soon.'); }
});

// live signal flicker
setInterval(() => {
  const el = $('#sigStrength');
  if (el) el.textContent = 'Excellent ' + (98 + Math.random()).toFixed(1) + '%';
}, 5000);
