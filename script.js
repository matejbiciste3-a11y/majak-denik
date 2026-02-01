const GEMINI_API_KEY = 'AIzaSyBJ7oiPWwhXZQH4photwoLW7kEdlxZYPXM';
const SESSION_TIMEOUT = 20 * 60 * 60 * 1000; // 20 hodin v ms

function checkSessionExpiry() {
    const loginTime = localStorage.getItem('last_login_time');
    if (loginTime) {
        const now = Date.now();
        if (now - parseInt(loginTime) > SESSION_TIMEOUT) {
            console.log("Session expired. Logging out.");
            handleLogout();
        }
    }
}

async function handleLogout() {
    localStorage.removeItem('last_login_time');
    await _supabase.auth.signOut();
    window.location.href = 'index.html';
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function setLoading(btnId, isLoading, text = 'Uložit') {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.innerHTML = `<span style="opacity:0.8">Pracuji...</span>`;
    } else {
        btn.disabled = false;
        btn.textContent = text;
    }
}

const path = window.location.pathname.toLowerCase();
const isJournalPage = path.includes('journal.html');
const isIndexPage = path.includes('index.html') || path.endsWith('/') || path.includes('fz3temp') || document.getElementById('donate-btn');
const isBlogPage = path.includes('blog.html');
const isLoginPage = path.includes('login.html');
const isRegisterPage = path.includes('register.html');

// Unified Auth Logic
_supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
        localStorage.setItem('last_login_time', Date.now().toString());
    }

    if (!session && isJournalPage) {
        window.location.href = 'login.html';
    } else if (session && isJournalPage) {
        loadEntries();
    }

    if (isIndexPage) {
        updateLandingNav(session);
    }
});

function updateLandingNav(session) {
    const nav = document.getElementById('main-nav');
    if (!nav) return;

    if (session) {
        const user = session.user;
        const displayName = user.email.split('@')[0];
        nav.innerHTML = `
            <span class="brand">Maják 🌊</span>
            <div class="user-menu" id="user-menu-trigger">
                <div class="user-toggle">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}" alt="avatar">
                    <span>${displayName}</span>
                </div>
                <div class="dropdown-content">
                    <a href="journal.html" class="dropdown-item">📝 Moje poznámky</a>
                    <a href="chat.html" class="dropdown-item">💬 Chat s Majákem</a>
                    <a href="blog.html" class="dropdown-item">🌍 Veřejný blog</a>
                    <div class="dropdown-divider"></div>
                    <a href="#" class="dropdown-item logout" id="logout-btn">🚪 Odhlásit</a>
                </div>
            </div>
        `;
        document.getElementById('logout-btn').onclick = (e) => {
            e.preventDefault();
            handleLogout();
        };
    } else {
        nav.innerHTML = `
            <span class="brand">Maják 🌊</span>
            <div style="display: flex; gap: 15px;">
                <a href="blog.html" class="nav-link">Blog</a>
                <a href="login.html" class="nav-link">Přihlásit</a>
                <a href="register.html" class="btn-small" style="text-decoration: none;">Registrace</a>
            </div>
        `;
    }
}

// Initialization
checkSessionExpiry();

if (isIndexPage) {
    loadNews();
    initDonations();
}

function initDonations() {
    const btns = document.querySelectorAll('.amount-btn');
    const customInput = document.getElementById('custom-amount');
    const donateBtn = document.getElementById('donate-btn');

    if (!donateBtn) return;

    btns.forEach(btn => {
        btn.onclick = () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            customInput.value = '';
        };
    });

    customInput.oninput = () => {
        if (customInput.value) {
            btns.forEach(b => b.classList.remove('active'));
        }
    };

    donateBtn.onclick = () => {
        const activeBtn = document.querySelector('.amount-btn.active');
        const amount = activeBtn ? activeBtn.dataset.amount : customInput.value;

        if (!amount || amount <= 0) {
            showToast("Prosím vyber nebo zadej částku.", "error");
            return;
        }

        const qrResult = document.getElementById('qr-result');
        const qrImage = document.getElementById('qr-image');

        // Generování QR kódu přes Paylibo API (standard pro ČR)
        const qrUrl = `https://api.paylibo.com/paylibo/generator/czech/image?accountNumber=2547178047&bankCode=3030&amount=${amount}&currency=CZK&message=Podpora+projektu+Majak`;

        qrImage.src = qrUrl;
        qrResult.style.display = 'block';

        donateBtn.textContent = 'Aktualizovat částku v QR';
        showToast(`QR kód pro ${amount} Kč připraven! ✨`, "success");

        // Scroll k výsledku pro lepší UX na mobilu
        qrResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
}

if (isJournalPage) {
    const logoutBtn = document.getElementById('logout');
    if (logoutBtn) {
        logoutBtn.onclick = handleLogout;
    }

    const saveBtn = document.getElementById('save');
    if (saveBtn) {
        saveBtn.onclick = async () => {
            const contentText = document.getElementById('text').value;
            const moodValue = document.getElementById('mood').value;
            const isPublicValue = document.getElementById('is-public-checkbox').checked;

            if (!contentText.trim()) {
                showToast("Napiš nejdřív něco do deníku!", "error");
                return;
            }

            setLoading('save', true, 'Ukládám...');

            const { data: { user } } = await _supabase.auth.getUser();

            if (!user) {
                showToast("Uživatel nenalezen, přihlas se znovu.", "error");
                setLoading('save', false, 'Uložit');
                return;
            }

            const { error } = await _supabase.from('journal_entries').insert([{
                content: contentText,
                mood_rating: moodValue,
                user_id: user.id,
                is_public: isPublicValue
            }]);

            setLoading('save', false, 'Uložit');

            if (error) {
                showToast("Chyba při ukládání: " + error.message, "error");
            } else {
                showToast("Zápis uložen!", "success");
                document.getElementById('text').value = '';
                document.getElementById('is-public-checkbox').checked = false;
                loadEntries();
            }
        };
    }
}

if (isLoginPage) {
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.onclick = async () => {
            const email = document.getElementById('email').value;
            const password = document.getElementById('pass').value;
            if (!email || !password) { showToast("Vyplň údaje.", "error"); return; }
            setLoading('login-btn', true);
            const { error } = await _supabase.auth.signInWithPassword({ email, password });
            setLoading('login-btn', false, 'Vstoupit');
            if (error) showToast(error.message, "error");
            else window.location.href = 'journal.html';
        };
    }
}

if (isRegisterPage) {
    const regBtn = document.getElementById('reg-btn');
    if (regBtn) {
        regBtn.onclick = async () => {
            const email = document.getElementById('email').value;
            const password = document.getElementById('pass').value;
            if (!email || !password) { showToast("Vyplň údaje.", "error"); return; }
            setLoading('reg-btn', true);
            const { error, data } = await _supabase.auth.signUp({ email, password });
            setLoading('reg-btn', false, 'Vytvořit účet');
            if (error) showToast(error.message, "error");
            else {
                showToast("Vítej na palubě!", "success");
                window.location.href = 'journal.html';
            }
        };
    }
}

if (isBlogPage) {
    loadPublicPosts();
}

async function loadEntries() {
    const div = document.getElementById('entries');
    if (!div) return;
    div.innerHTML = '<div class="loading">Načítám tvůj deník...</div>';

    const { data, error } = await _supabase.from('journal_entries').select('*').order('created_at', { ascending: false });

    if (error) { div.innerHTML = '<p>Chyba načítání.</p>'; return; }
    div.innerHTML = '';

    data.forEach(item => {
        const d = new Date(item.created_at).toLocaleString('cs-CZ', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
        const privacyIcon = item.is_public ? '🌍 Veřejné' : '🔒 Soukromé';
        let moodIcon = item.mood_rating == 10 ? '😊' : (item.mood_rating == 1 ? '😔' : '😐');

        div.innerHTML += `
            <div class="entry-card">
                <div class="date">
                    <span>${d}</span>
                    <span style="opacity:0.8; font-size:0.8em">${privacyIcon} &bull; ${moodIcon}</span>
                </div>
                <div class="content-text">${item.content}</div>
                ${item.ai_response ? `<div class="ai-box"><b>Maják:</b> ${item.ai_response}</div>` : ''}
            </div>
        `;
    });
}

function loadNews() {
    const feed = document.getElementById('news-feed');
    if (!feed) return;

    const news = [
        { title: "Nové vědecké objevy o meditaci", text: "Studie potvrzují, že stačí 10 minut denně pro výrazné zlepšení duševního zdraví.", tag: "Věda" },
        { title: "Světový den laskavosti", text: "Dnes lidé po celém světě sdílejí drobné skutky dobroty pod hashtagem #MajakLaskavosti.", tag: "Společnost" },
        { title: "Zelenější budoucnost", text: "Evropská města zavádějí nové parky pro podporu komunitního života.", tag: "Ekologie" }
    ];

    feed.innerHTML = '';
    news.forEach(item => {
        feed.innerHTML += `
            <div class="news-card">
                <span class="news-tag">${item.tag}</span>
                <h3>${item.title}</h3>
                <p>${item.text}</p>
            </div>
        `;
    });
}

async function loadPublicPosts() {
    const div = document.getElementById('public-posts');
    if (!div) return;
    const { data, error } = await _supabase.from('journal_entries').select('*').eq('is_public', true).order('created_at', { ascending: false });
    if (error) return;
    div.innerHTML = '';
    data.forEach(item => {
        const d = new Date(item.created_at).toLocaleString('cs-CZ', { day: 'numeric', month: 'long' });
        div.innerHTML += `
            <div class="entry-card shadow">
                <div class="date">${d}</div>
                <div class="content-text">${item.content}</div>
                ${item.ai_response ? `<div class="ai-box">✨ Maják: ${item.ai_response}</div>` : ''}
            </div>
        `;
    });
}