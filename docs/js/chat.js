(function () {
  if (window.location.pathname.endsWith('auth.html')) return;

  const style = document.createElement('style');
  style.textContent = `
    #lac-chat-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 1000;
      width: 48px; height: 48px; border-radius: 50%;
      background: var(--navy, #1B2A3F); color: #fff;
      border: none; cursor: pointer; font-size: 18px;
      box-shadow: 0 2px 10px rgba(0,0,0,.25);
      display: flex; align-items: center; justify-content: center;
      transition: transform .15s, box-shadow .15s;
    }
    #lac-chat-btn:hover { transform: scale(1.08); box-shadow: 0 4px 16px rgba(0,0,0,.3); }
    #lac-chat-panel {
      position: fixed; bottom: 82px; right: 24px; z-index: 999;
      width: 360px; max-height: 520px;
      background: #fff; border-radius: 12px;
      box-shadow: 0 6px 28px rgba(0,0,0,.18);
      display: flex; flex-direction: column; overflow: hidden;
      transform: scale(.95) translateY(10px); opacity: 0;
      pointer-events: none;
      transition: opacity .15s ease, transform .15s ease;
    }
    #lac-chat-panel.open {
      transform: scale(1) translateY(0); opacity: 1; pointer-events: all;
    }
    .lac-chat-header {
      background: var(--navy, #1B2A3F); color: #fff;
      padding: 12px 16px; font-size: 13px; font-weight: 600;
      display: flex; justify-content: space-between; align-items: center;
      flex-shrink: 0;
    }
    .lac-chat-header-close {
      background: none; border: none; color: rgba(255,255,255,.7);
      cursor: pointer; font-size: 20px; line-height: 1; padding: 0 2px;
    }
    .lac-chat-header-close:hover { color: #fff; }
    .lac-chat-messages {
      flex: 1; overflow-y: auto; padding: 14px;
      display: flex; flex-direction: column; gap: 10px;
      min-height: 180px;
    }
    .lac-msg {
      max-width: 88%; padding: 9px 12px; border-radius: 10px;
      font-size: 13px; line-height: 1.5; word-break: break-word;
    }
    .lac-msg-user {
      align-self: flex-end;
      background: var(--navy, #1B2A3F); color: #fff;
      border-bottom-right-radius: 3px;
    }
    .lac-msg-ai {
      align-self: flex-start;
      background: var(--bg, #F0F2F5); color: var(--text, #1B2A3F);
      border-bottom-left-radius: 3px;
    }
    .lac-msg-thinking { color: var(--navy-muted, #8BA7C4); font-style: italic; }
    .lac-chat-input-row {
      display: flex; gap: 8px; padding: 10px 12px;
      border-top: 1px solid var(--border, #E0E6ED);
      background: #fff; flex-shrink: 0;
    }
    .lac-chat-input {
      flex: 1; border: 1px solid var(--border, #E0E6ED); border-radius: 8px;
      padding: 7px 10px; font-size: 13px; outline: none;
      font-family: inherit; resize: none; max-height: 80px; line-height: 1.4;
    }
    .lac-chat-input:focus { border-color: var(--blue, #2E6DA4); }
    .lac-chat-send {
      background: var(--navy, #1B2A3F); color: #fff; border: none;
      border-radius: 8px; padding: 7px 14px; cursor: pointer;
      font-size: 13px; font-weight: 600; white-space: nowrap; align-self: flex-end;
    }
    .lac-chat-send:disabled { opacity: .45; cursor: default; }
  `;
  document.head.appendChild(style);

  document.body.insertAdjacentHTML('beforeend', `
    <button id="lac-chat-btn" title="Ask AI">✦</button>
    <div id="lac-chat-panel" role="dialog" aria-label="LAC Assistant">
      <div class="lac-chat-header">
        <span>LAC Assistant</span>
        <button class="lac-chat-header-close" id="lac-chat-close" aria-label="Close">×</button>
      </div>
      <div class="lac-chat-messages" id="lac-chat-messages">
        <div class="lac-msg lac-msg-ai">Hi Jeffrey — ask me anything about your clients, PBC requests, or deadlines.</div>
      </div>
      <div class="lac-chat-input-row">
        <textarea class="lac-chat-input" id="lac-chat-input" rows="1" placeholder="Ask a question…" aria-label="Message"></textarea>
        <button class="lac-chat-send" id="lac-chat-send">Send</button>
      </div>
    </div>
  `);

  const btn   = document.getElementById('lac-chat-btn');
  const panel = document.getElementById('lac-chat-panel');
  const msgs  = document.getElementById('lac-chat-messages');
  const input = document.getElementById('lac-chat-input');
  const send  = document.getElementById('lac-chat-send');

  document.getElementById('lac-chat-close').addEventListener('click', () => panel.classList.remove('open'));
  btn.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) input.focus();
  });

  function addMsg(text, role) {
    const div = document.createElement('div');
    div.className = 'lac-msg lac-msg-' + role;
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || send.disabled) return;
    input.value = '';
    input.style.height = '';
    send.disabled = true;
    addMsg(text, 'user');
    const thinking = addMsg('Thinking…', 'ai lac-msg-thinking');
    try {
      const data = await apiFetch('/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      });
      thinking.remove();
      addMsg(data && data.answer ? data.answer : 'No response received.', 'ai');
    } catch (err) {
      thinking.remove();
      addMsg('Error: ' + (err.message || 'Request failed'), 'ai');
    } finally {
      send.disabled = false;
      input.focus();
    }
  }

  send.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 80) + 'px';
  });
})();
