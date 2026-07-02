const API_BASE = 'https://real-estate-autopost.vercel.app';

const input     = document.getElementById('code-input');
const searchBtn = document.getElementById('search-btn');
const resultDiv = document.getElementById('result');
const errorMsg  = document.getElementById('error-msg');
const notFound  = document.getElementById('not-found');

function hide(...els) { els.forEach(e => { e.style.display = 'none'; }); }
function show(el, display = 'block') { el.style.display = display; }

async function lookup() {
  const code = input.value.trim();
  if (!code) return;

  hide(resultDiv, errorMsg, notFound);
  searchBtn.disabled = true;
  searchBtn.textContent = '…';

  try {
    const res  = await fetch(`${API_BASE}/api/unit-lookup?code=${encodeURIComponent(code)}`);
    const data = await res.json();

    if (!res.ok || data.error) {
      show(errorMsg);
      errorMsg.textContent = data.error || 'Ошибка запроса';
      return;
    }

    if (!data.found) {
      show(notFound);
      return;
    }

    // Status badge
    const badge = document.getElementById('status-badge');
    if (data.available) {
      badge.textContent = '✅ Available';
      badge.className = 'status-badge available';
    } else {
      badge.textContent = '🚫 Not Available';
      badge.className = 'status-badge unavailable';
    }

    document.getElementById('f-unit').textContent = data.unit || '—';
    document.getElementById('f-code').textContent = data.code || '—';

    // Link
    const linkRow = document.getElementById('link-row');
    const fLink   = document.getElementById('f-link');
    if (data.link) {
      fLink.innerHTML = `<a href="${data.link}" target="_blank">${data.link}</a>`;
      show(linkRow);
    } else {
      hide(linkRow);
    }

    // Comments
    const commentRow = document.getElementById('comment-row');
    const fComment   = document.getElementById('f-comment');
    if (data.comments) {
      fComment.textContent = data.comments;
      show(commentRow);
    } else {
      hide(commentRow);
    }

    show(resultDiv);

    // Copy button
    const copyBtn = document.getElementById('copy-btn');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = '📋 Копировать для WhatsApp';
    copyBtn.onclick = () => {
      let text = '';
      if (data.unit)  text += `Unit: ${data.unit}\n`;
      if (data.code)  text += `Code: ${data.code}\n`;
      if (data.link)  text += `${data.link}`;
      text = text.trim();
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = '✅ Скопировано!';
        copyBtn.className = 'copy-btn copied';
        setTimeout(() => {
          copyBtn.textContent = '📋 Копировать для WhatsApp';
          copyBtn.className = 'copy-btn';
        }, 2000);
      });
    };

  } catch (e) {
    show(errorMsg);
    errorMsg.textContent = 'Ошибка сети: ' + e.message;
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = 'Найти';
  }
}

searchBtn.addEventListener('click', lookup);
input.addEventListener('keydown', e => { if (e.key === 'Enter') lookup(); });
input.focus();
