/**
 * CALVORO Premium Chat Widget
 */
(function() {
    // Configuration
    const CONFIG = {
        socketUrl: window.location.origin,
        storageKey: 'calvoro_chat_uuid',
        assistantName: 'Calvoro Support',
        welcomeMessage: 'Hi there! How can we help you today?'
    };

    let socket;
    let chatUuid = localStorage.getItem(CONFIG.storageKey);
    let isOpen = false;

    if (!chatUuid) {
        chatUuid = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now();
        localStorage.setItem(CONFIG.storageKey, chatUuid);
    }

    // UI Element Templates
    const createWidget = () => {
        const container = document.createElement('div');
        container.className = 'chat-widget';
        container.innerHTML = `
            <div class="chat-window" id="calvoroChatWindow">
                <div class="chat-header">
                    <div class="chat-header-info">
                        <div class="chat-header-avatar">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                            </svg>
                        </div>
                        <div>
                            <div class="chat-header-title">${CONFIG.assistantName}</div>
                            <div class="chat-header-status">Online</div>
                        </div>
                    </div>
                    <button id="chatCloseBtn" style="background:none;border:none;color:white;cursor:pointer;font-size:20px;">×</button>
                </div>
                <div class="chat-messages" id="chatMessages"></div>
                <div class="chat-input-area">
                    <input type="text" class="chat-input" id="chatInput" placeholder="Type your message...">
                    <button class="chat-send" id="chatSendBtn">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="chat-button" id="chatTrigger">
                <svg viewBox="0 0 24 24" fill="white">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                </svg>
                <div id="chatBadge" class="chat-unread-badge" style="display:none;">0</div>
            </div>
        `;
        document.body.appendChild(container);

        // Event Listeners
        document.getElementById('chatTrigger').onclick = toggleChat;
        document.getElementById('chatCloseBtn').onclick = toggleChat;
        document.getElementById('chatSendBtn').onclick = sendMessage;
        document.getElementById('chatInput').onkeypress = (e) => {
            if (e.key === 'Enter') sendMessage();
        };

        initSocket();
    };

    const toggleChat = () => {
        isOpen = !isOpen;
        const window = document.getElementById('calvoroChatWindow');
        const badge = document.getElementById('chatBadge');
        if (isOpen) {
            window.classList.add('open');
            badge.style.display = 'none';
            badge.innerText = '0';
            socket.emit('markAsRead');
            document.getElementById('chatInput').focus();
        } else {
            window.classList.remove('open');
        }
    };

    const addMessage = (msg) => {
        const chatMessages = document.getElementById('chatMessages');
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${msg.sender_type}`;
        
        const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        msgDiv.innerHTML = `
            <div>${msg.content}</div>
            <div class="chat-time">${time}</div>
        `;
        
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        if (!isOpen && msg.sender_type === 'admin') {
            const badge = document.getElementById('chatBadge');
            const count = parseInt(badge.innerText) + 1;
            badge.innerText = count;
            badge.style.display = 'block';
            playNotification();
        }
    };

    const playNotification = () => {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
        audio.play().catch(e => console.log('Sound blocked'));
    };

    const sendMessage = () => {
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        if (!text) return;

        socket.emit('customerMessage', { text });
        input.value = '';
    };

    const initSocket = () => {
        if (typeof io === 'undefined') {
            console.error('Socket.io client not loaded');
            return;
        }

        socket = io(CONFIG.socketUrl);

        socket.on('connect', () => {
            socket.emit('joinCustomer', chatUuid, (res) => {
                if (res.success) {
                    const chatMessages = document.getElementById('chatMessages');
                    chatMessages.innerHTML = '';
                    
                    if (res.messages.length === 0) {
                        addMessage({
                            sender_type: 'admin',
                            content: CONFIG.welcomeMessage,
                            created_at: new Date()
                        });
                    } else {
                        res.messages.forEach(addMessage);
                    }
                }
            });
        });

        socket.on('newMessage', (msg) => {
            addMessage(msg);
        });
    };

    // Load Socket.io then init
    if (document.readyState === 'complete') {
        createWidget();
    } else {
        window.addEventListener('load', createWidget);
    }

})();
