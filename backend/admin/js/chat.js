/**
 * CALVORO Admin Chat Logic
 */
(function() {
    const base = window.CalvoroAPIBase || '';
    let socket;
    let sessions = [];
    let activeSession = null;

    // UI Elements
    const sessionList = document.getElementById('sessionList');
    const emptyState = document.getElementById('emptyState');
    const activeWindow = document.getElementById('activeWindow');
    const messagesContainer = document.getElementById('activeMessages');
    const adminChatInput = document.getElementById('adminChatInput');
    const adminSendBtn = document.getElementById('adminSendBtn');

    async function init() {
        initSocket();
        await loadSessions();
        
        adminSendBtn.onclick = sendMessage;
        adminChatInput.onkeypress = (e) => {
            if (e.key === 'Enter') sendMessage();
        };

        // Search functionality
        document.getElementById('chatSearch').oninput = (e) => {
            const term = e.target.value.toLowerCase();
            renderSessions(sessions.filter(s => 
                (s.customer_name && s.customer_name.toLowerCase().includes(term)) ||
                (s.session_uuid && s.session_uuid.toLowerCase().includes(term))
            ));
        };
    }

    function initSocket() {
        socket = io(window.location.origin);

        socket.on('connect', () => {
            socket.emit('joinAdmin', {}, (res) => {
                console.log('Admin joined socket room');
            });
        });

        socket.on('adminNewMessage', (data) => {
            const { uuid, msg } = data;
            
            // If active session, add message
            if (activeSession && activeSession.session_uuid === uuid) {
                appendMessage(msg);
                socket.emit('markAsRead', { uuid });
            }

            // Update session list item
            const session = sessions.find(s => s.session_uuid === uuid);
            if (session) {
                session.last_message_at = msg.created_at;
                if (!activeSession || activeSession.session_uuid !== uuid) {
                    session.unread_admin++;
                }
                // Sort sessions: move updated one to top
                sessions.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
                renderSessions(sessions);
            } else {
                // New session we don't have yet, reload all
                loadSessions();
            }

            playNotification();
        });

        socket.on('customerOnline', (data) => {
            console.log('Customer online:', data.uuid);
            // Optionally update online status in UI
        });
    }

    async function loadSessions() {
        try {
            const res = await fetch(base + '/api/admin/chat/sessions', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load sessions');
            sessions = await res.json();
            renderSessions(sessions);
        } catch (e) {
            console.error(e);
            sessionList.innerHTML = '<div class="error">Failed to load conversations</div>';
        }
    }

    function renderSessions(list) {
        if (list.length === 0) {
            sessionList.innerHTML = '<div class="empty">No conversations yet</div>';
            return;
        }

        sessionList.innerHTML = list.map(s => {
            const name = s.customer_name || 'Guest Customer';
            const initial = name.charAt(0);
            const time = new Date(s.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const activeClass = activeSession && activeSession.id === s.id ? 'active' : '';
            const badge = s.unread_admin > 0 ? `<div class="session-badge">${s.unread_admin}</div>` : '';

            return `
                <div class="chat-session-item ${activeClass}" onclick="window.adminChat.selectSession(${s.id})">
                    <div class="session-avatar">${initial}</div>
                    <div class="session-info">
                        <div class="session-name">${name}</div>
                        <div class="session-last-msg">${s.session_uuid}</div>
                    </div>
                    <div class="session-meta">
                        <div class="session-time">${time}</div>
                        ${badge}
                    </div>
                </div>
            `;
        }).join('');
    }

    async function selectSession(sessionId) {
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;

        activeSession = session;
        session.unread_admin = 0; // Local clear
        renderSessions(sessions);

        // UI Prep
        emptyState.style.display = 'none';
        activeWindow.style.display = 'flex';
        document.getElementById('activeName').innerText = session.customer_name || 'Guest Customer';
        document.getElementById('activeAvatar').innerText = (session.customer_name || 'G').charAt(0);
        messagesContainer.innerHTML = '<div class="loading">Loading messages...</div>';

        try {
            const res = await fetch(base + `/api/admin/chat/sessions/${sessionId}/messages`, { credentials: 'include' });
            const messages = await res.json();
            messagesContainer.innerHTML = '';
            messages.forEach(appendMessage);
            socket.emit('markAsRead', { uuid: session.session_uuid });
        } catch (e) {
            console.error(e);
        }
    }

    function appendMessage(msg) {
        const div = document.createElement('div');
        div.className = `admin-msg-bubble ${msg.sender_type}`;
        const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        div.innerHTML = `
            <div>${msg.content}</div>
            <div class="msg-time">${time}</div>
        `;
        
        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function sendMessage() {
        const text = adminChatInput.value.trim();
        if (!text || !activeSession) return;

        socket.emit('adminMessage', {
            uuid: activeSession.session_uuid,
            text: text
        });

        adminChatInput.value = '';
    }

    function playNotification() {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
        audio.play().catch(e => {});
    }

    // Export select function to global for onclick
    window.adminChat = { selectSession };

    init();
})();
