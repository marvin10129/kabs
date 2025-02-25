require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI + '/kabschat', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('MongoDB connection error:', err);
});

// Models
const User = mongoose.model('User', {
    username: { 
        type: String, 
        required: true, 
        unique: true 
    },
    profilePic: {
        data: String,  // Store Base64 string
        contentType: String  // Store mime type
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

const Message = mongoose.model('Message', {
    text: String,
    username: String,
    profilePicUrl: String,
    userId: String,
    media: {
        data: String,     // base64 data
        type: String,     // 'image'
        mimeType: String  // e.g., 'image/jpeg'
    },
    timestamp: { type: Date, default: Date.now }
});

// Remove multer storage configuration and use memory storage instead
const upload = multer({
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function(req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif/;
        const mimetype = filetypes.test(file.mimetype);
        
        if (mimetype) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed!'));
    }
}).single('profilePic');

// User route
app.post('/api/users', (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            console.error('Upload error:', err.message);
            return res.status(400).json({ error: err.message });
        }

        try {
            const { username } = req.body;
            console.log('Processing user:', username);

            // First try to find existing user
            let user = await User.findOne({ username });

            if (user) {
                // If user exists, just return the existing user
                console.log('Existing user found:', username);
                return res.json({
                    _id: user._id,
                    username: user.username,
                    profilePicUrl: `data:${user.profilePic.contentType};base64,${user.profilePic.data}`
                });
            }

            // If user doesn't exist, create new user
            let profilePic = {
                data: '',
                contentType: 'image/png'
            };

            if (req.file) {
                profilePic = {
                    data: req.file.buffer.toString('base64'),
                    contentType: req.file.mimetype
                };
            } else {
                // Read default avatar and convert to base64
                const defaultAvatarPath = path.join(__dirname, 'public', 'default-avatar.png');
                const defaultAvatar = await fs.promises.readFile(defaultAvatarPath);
                profilePic = {
                    data: defaultAvatar.toString('base64'),
                    contentType: 'image/png'
                };
            }

            user = new User({
                username,
                profilePic
            });

            await user.save();
            console.log('New user created:', user.username);
            
            // Return user with base64 image URL
            res.json({
                _id: user._id,
                username: user.username,
                profilePicUrl: `data:${user.profilePic.contentType};base64,${user.profilePic.data}`
            });
        } catch (error) {
            console.error('Error processing user:', error);
            res.status(500).json({ error: error.message });
        }
    });
});

// Track online users
const onlineUsers = new Set();

// Socket.IO
io.on('connection', (socket) => {
    console.log('User connected');

    socket.on('user_join', (userId) => {
        socket.userId = userId;
        onlineUsers.add(userId);
        io.emit('online_users', Array.from(onlineUsers));
    });

    socket.on('new_message', async (messageData) => {
        try {
            const message = new Message(messageData);
            await message.save();
            io.emit('message', message);
        } catch (error) {
            console.error('Error saving message:', error);
            socket.emit('error', error.message);
        }
    });

    socket.on('typing', (data) => {
        socket.broadcast.emit('user_typing', data);
    });

    socket.on('disconnect', () => {
        if (socket.userId) {
            onlineUsers.delete(socket.userId);
            io.emit('online_users', Array.from(onlineUsers));
        }
    });
});

// Add this route to get all messages
app.get('/api/messages', async (req, res) => {
    try {
        const messages = await Message.find().sort({ timestamp: 1 });
        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 