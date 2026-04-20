const db = require('../db');

module.exports = function(io) {
    io.on('connection', (socket) => {
        // Customer joins with a UUID
        socket.on('joinCustomer', async (uuid, cb) => {
            if(!uuid) return;
            socket.join(uuid);
            
            try {
                let session = await db.getChatSessionByUuid(uuid);
                if(!session) {
                    const sessionId = await db.createChatSession(uuid, 'Guest Customer', null);
                    session = { id: sessionId, session_uuid: uuid };
                }
                socket.session_uuid = uuid;
                socket.chat_session_id = session.id;

                const messages = await db.getChatMessages(session.id);
                if(cb) cb({ success: true, session, messages });
                
                // Notify admin that a customer is online
                io.to('admin_room').emit('customerOnline', { uuid });
            } catch(e) {
                console.error("Chat Error:", e);
                if(cb) cb({ success: false });
            }
        });

        // Admin joins
        socket.on('joinAdmin', (adminData, cb) => {
            socket.join('admin_room');
            socket.isAdmin = true;
            if(cb) cb({ success: true });
        });

        // Sending message from Customer
        socket.on('customerMessage', async (data, cb) => {
            const uuid = socket.session_uuid;
            const sessionId = socket.chat_session_id;
            if(!uuid || !sessionId) return;
            
            try {
                const result = await db.saveChatMessage(sessionId, 'customer', data.text);
                const msg = {
                    id: result.messageId,
                    session_id: sessionId,
                    sender_type: 'customer',
                    content: data.text,
                    created_at: result.createdAt
                };

                // Emit to the customer's room (all tabs)
                io.to(uuid).emit('newMessage', msg);
                // Emit to all admins
                io.to('admin_room').emit('adminNewMessage', { uuid, msg });
                
                if(cb) cb({ success: true });
            } catch(e) {
                console.error("Save message error:", e);
            }
        });

        // Sending message from Admin
        socket.on('adminMessage', async (data, cb) => {
            if(!socket.isAdmin) return;
            const uuid = data.uuid;
            
            try {
                const session = await db.getChatSessionByUuid(uuid);
                if(!session) return;

                const result = await db.saveChatMessage(session.id, 'admin', data.text);
                const msg = {
                    id: result.messageId,
                    session_id: session.id,
                    sender_type: 'admin',
                    content: data.text,
                    created_at: result.createdAt
                };

                // Emit to customer
                io.to(uuid).emit('newMessage', msg);
                // Emit back to admin
                io.to('admin_room').emit('adminNewMessage', { uuid, msg });

                if(cb) cb({ success: true });
            } catch(e) {
                console.error(e);
            }
        });

        socket.on('markAsRead', async (data) => {
            if(socket.isAdmin && data.uuid) {
               const session = await db.getChatSessionByUuid(data.uuid);
               if(session) {
                   await db.markChatAsRead(session.id, 'admin');
                   // optionally broadcast unread count update
                   io.to('admin_room').emit('chatRead', { uuid: data.uuid });
               }
            } else if(socket.session_uuid) {
               await db.markChatAsRead(socket.chat_session_id, 'customer');
            }
        });

        socket.on('disconnect', () => {
            // handle disconnect if needed
        });
    });
};
