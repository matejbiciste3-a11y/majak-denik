const GEMINI_API_KEY = 'ZDE_VLOZ_SVUJ_KLIC';
const chatWindow = document.getElementById('chat-window');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const sessionList = document.getElementById('session-list');
const newChatBtn = document.getElementById('new-chat-btn');
const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');
const currentChatTitle = document.getElementById('current-chat-title');

let currentSessionId = null;
let conversationHistory = [];

const INITIAL_PROMPT = {
    role: "user",
    parts: [{ text: "Jsi Maják, empatický a moudrý průvodce v deníku. Tvým úkolem je naslouchat uživateli, být mu oporou, odpovídat krátce (max 3 věty) a lidsky. Mluv česky." }]
};

function resetHistory() {
    conversationHistory = [INITIAL_PROMPT, { role: "model", parts: [{ text: "Rozumím. Jsem připraven naslouchat a být ti oporou na tvé cestě." }] }];
}

function appendMessage(text, isAi) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isAi ? 'ai-message' : 'user-message'}`;
    msgDiv.textContent = text;
    chatWindow.appendChild(msgDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Načtení seznamu relací
async function loadSessions() {
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await _supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) return;

    sessionList.innerHTML = '';
    data.forEach(session => {
        const div = document.createElement('div');
        div.className = `session-item ${session.id === currentSessionId ? 'active' : ''}`;
        div.textContent = session.title;
        div.onclick = () => switchSession(session.id, session.title);
        sessionList.appendChild(div);
    });
}

// Přepnutí relace
async function switchSession(id, title) {
    currentSessionId = id;
    currentChatTitle.textContent = title;
    chatWindow.innerHTML = '';
    resetHistory();
    loadSessions();

    const { data, error } = await _supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', id)
        .order('created_at', { ascending: true });

    if (error) return;

    if (data) {
        data.forEach(msg => {
            appendMessage(msg.content, msg.is_ai);
            conversationHistory.push({
                role: msg.is_ai ? "model" : "user",
                parts: [{ text: msg.content }]
            });
        });
    }

    if (window.innerWidth <= 768) sidebar.classList.remove('open');
}

// Nový chat
newChatBtn.onclick = () => {
    currentSessionId = null;
    currentChatTitle.textContent = "Nová konverzace";
    chatWindow.innerHTML = '<div class="message ai-message">Ahoj! O čem dnes přemýšlíš?</div>';
    chatInput.value = '';
    resetHistory();
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
};

async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) return;

    // Pokud nemáme relaci, vytvoříme ji
    if (!currentSessionId) {
        const { data: session, error: sErr } = await _supabase.from('chat_sessions').insert([{
            user_id: user.id,
            title: text.substring(0, 30) + (text.length > 30 ? '...' : '')
        }]).select().single();

        if (sErr) return;
        currentSessionId = session.id;
        currentChatTitle.textContent = session.title;
        loadSessions();
    }

    appendMessage(text, false);
    chatInput.value = '';

    await _supabase.from('chat_messages').insert([{
        user_id: user.id,
        session_id: currentSessionId,
        content: text,
        is_ai: false
    }]);

    sendBtn.disabled = true;
    sendBtn.textContent = '...';
    conversationHistory.push({ role: "user", parts: [{ text: text }] });

    try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: conversationHistory })
        });

        const data = await resp.json();
        const aiText = data.candidates[0].content.parts[0].text;

        appendMessage(aiText, true);

        await _supabase.from('chat_messages').insert([{
            user_id: user.id,
            session_id: currentSessionId,
            content: aiText,
            is_ai: true
        }]);

        conversationHistory.push({ role: "model", parts: [{ text: aiText }] });

    } catch (e) {
        console.error(e);
        appendMessage("🌌 Maják teď nesvítí. Zkus to za chvíli.", true);
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Odeslat';
    }
}

sendBtn.onclick = sendMessage;
chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
toggleSidebarBtn.onclick = () => sidebar.classList.toggle('open');

_supabase.auth.onAuthStateChange((event, session) => {
    if (!session) {
        window.location.href = 'login.html';
    } else {
        loadSessions();
    }
});

