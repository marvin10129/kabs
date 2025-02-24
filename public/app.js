let currentUser = null;
let socket = null;
let typingTimeout = null;

// Add audio recording variables
let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let recordingStartTime = null;

// Connect to Socket.IO
function connectSocket() {
    socket = io(window.location.origin, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    socket.on('connect', () => {
        console.log('Connected to server');
    });

    socket.on('message', addMessage);
    socket.on('online_users', updateOnlineUsers);
    socket.on('user_typing', showTypingIndicator);
    socket.on('error', handleError);
}

// Add function to load previous messages
async function loadPreviousMessages() {
    try {
        const response = await fetch('/api/messages');
        if (!response.ok) {
            throw new Error('Failed to load messages');
        }
        const messages = await response.json();
        messages.forEach(addMessage);
    } catch (error) {
        console.error('Error loading messages:', error);
        handleError('Failed to load previous messages');
    }
}

// Initialize Chat
async function initializeChat() {
    try {
        connectSocket();
        setupEventListeners();
        await loadPreviousMessages();
        console.log('Chat initialized successfully');
    } catch (error) {
        console.error('Error initializing chat:', error);
        handleError('Failed to initialize chat');
    }
}

// Profile form submission
document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const usernameInput = document.getElementById('username-input');
    const saveButton = e.target.querySelector('button[type="submit"]');
    
    if (!usernameInput.value.trim()) {
        handleError('Username is required');
        return;
    }

    try {
        saveButton.textContent = 'Saving...';
        saveButton.disabled = true;

        const response = await fetch('/api/users', {
            method: 'POST',
            body: formData  // This will include both username and profile pic
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save profile');
        }

        currentUser = await response.json();
        console.log('Profile saved successfully:', currentUser);
        
        // Hide modal and connect socket
        document.getElementById('profile-modal').style.display = 'none';
        socket.emit('user_join', currentUser._id);

    } catch (error) {
        console.error('Error saving profile:', error);
        handleError(error.message);
    } finally {
        saveButton.textContent = 'Join Chat';
        saveButton.disabled = false;
    }
});

// Add preview for profile picture
document.getElementById('profile-pic-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            handleError('File size must be less than 5MB');
            this.value = '';
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('profile-pic-preview').src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
});

// Send message
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

async function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (!message) return;

    try {
        socket.emit('new_message', {
            text: message,
            username: currentUser.username,
            profilePicUrl: currentUser.profilePicUrl,
            userId: currentUser._id
        });
        input.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        handleError('Failed to send message');
    }
}

// Add message to chat
function addMessage(msg) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.userId === currentUser?._id ? 'sent' : 'received'}`;
    
    let messageContent = msg.text;
    if (msg.media && msg.media.type === 'image') {
        messageContent = `
            <div class="message-text">${msg.text}</div>
            <img src="data:${msg.media.mimeType};base64,${msg.media.data}" 
                 class="message-image" 
                 alt="Shared image"
                 onclick="openImageModal(this.src)">
        `;
    }
    
    messageDiv.innerHTML = `
        <img src="${msg.profilePicUrl}" class="profile-pic" alt="${msg.username}">
        <div class="content">
            <div class="username">${msg.username}</div>
            <div class="text">${messageContent}</div>
        </div>
    `;
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Update online users count
function updateOnlineUsers(users) {
    document.getElementById('online-users').textContent = `Online Users: ${users.length}`;
}

// Show typing indicator
function showTypingIndicator(data) {
    const typingDiv = document.getElementById('typing-indicator');
    typingDiv.textContent = `${data.username} is typing...`;
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        typingDiv.textContent = '';
    }, 1000);
}

// Handle typing event
document.getElementById('message-input').addEventListener('input', () => {
    socket.emit('typing', { username: currentUser.username });
});

// Error handling
function handleError(message) {
    alert(message);
}

// Setup Event Listeners
function setupEventListeners() {
    // Profile Picture Preview
    document.getElementById('profile-pic-input').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                handleError('File size must be less than 5MB');
                this.value = '';
                return;
            }
            
            const reader = new FileReader();
            reader.onload = function(e) {
                document.getElementById('profile-pic-preview').src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    // Add audio recording functions
    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'  // More widely supported format
            });
            audioChunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const formData = new FormData();
                formData.append('media', audioBlob, 'recording.webm');
                
                try {
                    const response = await fetch('/api/upload', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (!response.ok) {
                        throw new Error('Upload failed');
                    }
                    
                    const result = await response.json();
                    
                    socket.emit('new_message', {
                        text: '🔊 Audio Message',
                        username: currentUser.username,
                        profilePicUrl: currentUser.profilePicUrl,
                        userId: currentUser._id,
                        media: {
                            filename: result.filename,
                            type: 'audio',
                            mimeType: 'audio/webm'
                        }
                    });
                } catch (error) {
                    console.error('Error uploading audio:', error);
                    handleError('Failed to upload audio');
                }
                
                stopRecordingUI();
            };

            mediaRecorder.start();
            startRecordingUI();
            
        } catch (error) {
            console.error('Error starting recording:', error);
            handleError('Could not access microphone');
        }
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
    }

    function startRecordingUI() {
        document.getElementById('audio-status').style.display = 'block';
        document.getElementById('audio-btn').style.backgroundColor = 'red';
        recordingStartTime = Date.now();
        
        recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            document.getElementById('recording-time').textContent = 
                `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    function stopRecordingUI() {
        document.getElementById('audio-status').style.display = 'none';
        document.getElementById('audio-btn').style.backgroundColor = '';
        clearInterval(recordingTimer);
    }

    // Add event listeners
    document.getElementById('audio-btn').addEventListener('click', () => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            startRecording();
        } else {
            stopRecording();
        }
    });

    document.getElementById('stop-audio').addEventListener('click', stopRecording);

    // Add file attachment handling
    document.getElementById('attach-btn').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = false;
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            // Check file size (limit to 5MB)
            if (file.size > 5 * 1024 * 1024) {
                handleError('File too large. Maximum size is 5MB.');
                return;
            }
            
            try {
                // Convert image to base64
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const base64Data = e.target.result.split(',')[1];
                    
                    socket.emit('new_message', {
                        text: '📷 Image',
                        username: currentUser.username,
                        profilePicUrl: currentUser.profilePicUrl,
                        userId: currentUser._id,
                        media: {
                            data: base64Data,
                            type: 'image',
                            mimeType: file.type
                        }
                    });
                };
                reader.readAsDataURL(file);
            } catch (error) {
                console.error('Error uploading file:', error);
                handleError('Failed to upload file');
            }
        };
        
        input.click();
    });

    // Add image modal for viewing larger images
    function openImageModal(src) {
        const modal = document.createElement('div');
        modal.className = 'image-modal';
        modal.onclick = () => modal.remove();
        
        const img = document.createElement('img');
        img.src = src;
        modal.appendChild(img);
        
        document.body.appendChild(modal);
    }
}

// Start the chat
initializeChat(); 