const API_BASE = 'https://real-estate-autopost.vercel.app';
const STORAGE_KEY = 'unit_lookup_pos';

// ── Build widget ──────────────────────────────────────────────────────────────

const style = document.createElement('style');
style.textContent = `
#ul-widget {
  position: fixed;
  z-index: 99999;
  width: 300px;
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  color: #e2e8f0;
  user-select: none;
  overflow: hidden;
  line-height: 1.4;
}
#ul-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px;
  background: rgba(30, 41, 59, 0.7);
  cursor: grab;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
#ul-header:active { cursor: grabbing; }
#ul-title { font-size: 10px; font-weight: 600; color: #64748b; letter-spacing: 0.06em; text-transform: uppercase; }
#ul-toggle {
  background: none; border: none; color: #64748b; cursor: pointer;
  font-size: 15px; line-height: 1; padding: 0 2px;
}
#ul-toggle:hover { color: #94a3b8; }
#ul-body { padding: 10px 12px 12px; }
#ul-widget.collapsed #ul-body { display: none; }
#ul-search-row { display: flex; gap: 7px; margin-bottom: 10px; }
#ul-input {
  flex: 1;
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 7px;
  padding: 6px 10px;
  color: #f1f5f9;
  font-size: 13px;
  outline: none;
  min-width: 0;
}
#ul-input:focus { border-color: #6366f1; }
#ul-btn {
  background: #6366f1; color: white; border: none;
  border-radius: 7px; padding: 6px 12px; font-size: 12px; cursor: pointer;
  white-space: nowrap; flex-shrink: 0;
}
#ul-btn:hover { background: #4f46e5; }
#ul-btn:disabled { background: #334155; cursor: default; }
#ul-status { margin-bottom: 8px; }
.ul-badge {
  display: inline-block; font-size: 11px; font-weight: 600;
  padding: 2px 9px; border-radius: 20px;
}
.ul-ok  { background: rgba(20, 83, 45, 0.8); color: #4ade80; }
.ul-no  { background: rgba(76, 29, 29, 0.8); color: #f87171; }
.ul-field { margin-bottom: 7px; }
.ul-label { font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: 0.07em; }
.ul-val {
  color: #f1f5f9; word-break: break-word;
  overflow-wrap: break-word; line-height: 1.45; font-size: 13px;
}
.ul-val a {
  color: #818cf8; text-decoration: none;
  font-size: 11px; word-break: break-all; display: block;
}
.ul-val a:hover { text-decoration: underline; }
.ul-comment-text {
  color: #94a3b8; font-size: 12px; line-height: 1.5;
  white-space: pre-wrap; word-break: break-word;
  font-style: italic;
}
#ul-copy {
  width: 100%; margin-top: 10px;
  background: rgba(99, 102, 241, 0.15); color: #818cf8;
  border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 7px;
  padding: 7px; font-size: 12px; cursor: pointer;
}
#ul-copy:hover { background: rgba(99, 102, 241, 0.25); color: #a5b4fc; }
#ul-copy.ok { color: #4ade80; border-color: rgba(74, 222, 128, 0.3); background: rgba(20,83,45,0.2); }
#ul-msg { font-size: 12px; color: #94a3b8; margin-top: 5px; }
`;
document.head.appendChild(style);

const widget = document.createElement('div');
widget.id = 'ul-widget';
widget.innerHTML = `
  <div id="ul-header">
    <span id="ul-title">Unit Lookup</span>
    <button id="ul-toggle">−</button>
  </div>
  <div id="ul-body">
    <div id="ul-search-row">
      <input id="ul-input" type="text" placeholder="Код юнита…" autocomplete="off" spellcheck="false" />
      <button id="ul-btn">Найти</button>
    </div>
    <div id="ul-result" style="display:none">
      <div id="ul-status"></div>
      <div class="ul-field"><div class="ul-label">Unit</div><div class="ul-val" id="ul-unit"></div></div>
      <div class="ul-field"><div class="ul-label">Код</div><div class="ul-val" id="ul-code"></div></div>
      <div class="ul-field" id="ul-link-row"><div class="ul-label">Ссылка</div><div class="ul-val" id="ul-link"></div></div>
      <div class="ul-field" id="ul-comment-row"><div class="ul-label">Комментарии</div><div class="ul-comment-text" id="ul-comment"></div></div>
      <button id="ul-copy">📋 Копировать для WhatsApp</button>
    </div>
    <div id="ul-msg"></div>
  </div>
`;
document.body.appendChild(widget);

// ── Restore position ──────────────────────────────────────────────────────────

const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
widget.style.top  = (saved.top  ?? 80)  + 'px';
widget.style.left = (saved.left ?? 20) + 'px';
if (saved.collapsed) {
  widget.classList.add('collapsed');
  document.getElementById('ul-toggle').textContent = '+';
}

// ── Collapse toggle ───────────────────────────────────────────────────────────

document.getElementById('ul-toggle').addEventListener('click', () => {
  const collapsed = widget.classList.toggle('collapsed');
  document.getElementById('ul-toggle').textContent = collapsed ? '+' : '−';
  savePos();
});

// ── Drag ─────────────────────────────────────────────────────────────────────

const header = document.getElementById('ul-header');
let dragging = false, ox = 0, oy = 0;

header.addEventListener('mousedown', e => {
  if (e.target.id === 'ul-toggle') return;
  dragging = true;
  ox = e.clientX - widget.offsetLeft;
  oy = e.clientY - widget.offsetTop;
  e.preventDefault();
});
document.addEventListener('mousemove', e => {
  if (!dragging) return;
  const x = Math.max(0, Math.min(e.clientX - ox, window.innerWidth  - widget.offsetWidth));
  const y = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - widget.offsetHeight));
  widget.style.left = x + 'px';
  widget.style.top  = y + 'px';
});
document.addEventListener('mouseup', () => { if (dragging) { dragging = false; savePos(); } });

function savePos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    top:  parseInt(widget.style.top),
    left: parseInt(widget.style.left),
    collapsed: widget.classList.contains('collapsed'),
  }));
}

// ── Lookup ────────────────────────────────────────────────────────────────────

const inp    = document.getElementById('ul-input');
const btn    = document.getElementById('ul-btn');
const result = document.getElementById('ul-result');
const msg    = document.getElementById('ul-msg');

async function lookup() {
  const code = inp.value.trim();
  if (!code) return;
  result.style.display = 'none';
  msg.textContent = '';
  btn.disabled = true;
  btn.textContent = '…';

  try {
    const res  = await fetch(`${API_BASE}/api/unit-lookup?code=${encodeURIComponent(code)}`);
    const data = await res.json();

    if (!res.ok || data.error) { msg.textContent = data.error || 'Ошибка'; return; }
    if (!data.found)           { msg.textContent = 'Не найден'; return; }

    const statusDiv = document.getElementById('ul-status');
    statusDiv.innerHTML = data.available
      ? '<span class="ul-badge ul-ok">✅ Available</span>'
      : '<span class="ul-badge ul-no">🚫 Not Available</span>';

    document.getElementById('ul-unit').textContent = data.unit || '—';
    document.getElementById('ul-code').textContent = data.code || '—';

    const linkRow = document.getElementById('ul-link-row');
    const linkEl  = document.getElementById('ul-link');
    if (data.link) {
      linkEl.innerHTML = `<a href="${data.link}" target="_blank">${data.link}</a>`;
      linkRow.style.display = '';
    } else {
      linkRow.style.display = 'none';
    }

    const commentRow = document.getElementById('ul-comment-row');
    const commentEl  = document.getElementById('ul-comment');
    if (data.comments) {
      commentEl.textContent = data.comments;
      commentRow.style.display = '';
    } else {
      commentRow.style.display = 'none';
    }

    result.style.display = 'block';

    const copyBtn = document.getElementById('ul-copy');
    copyBtn.className = '';
    copyBtn.textContent = '📋 Копировать для WhatsApp';
    copyBtn.onclick = () => {
      let text = '';
      if (data.unit) text += `Unit: ${data.unit}\n`;
      if (data.code) text += `Code: ${data.code}\n`;
      if (data.link) text += data.link;
      navigator.clipboard.writeText(text.trim()).then(() => {
        copyBtn.textContent = '✅ Скопировано!';
        copyBtn.className = 'ok';
        setTimeout(() => {
          widget.classList.add('collapsed');
          document.getElementById('ul-toggle').textContent = '+';
          savePos();
        }, 800);
      });
    };

  } catch (e) {
    msg.textContent = 'Ошибка сети';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Найти';
  }
}

btn.addEventListener('click', lookup);
inp.addEventListener('keydown', e => { if (e.key === 'Enter') lookup(); });
