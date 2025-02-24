require('dotenv').config();
const mongoose = require('mongoose');

async function testConnection() {
    try {
        // Remove the first connection attempt
        await mongoose.connect(process.env.MONGODB_URI + '/kabschat');
        console.log('Successfully connected to MongoDB');
        
        // Try to create a test user
        const User = mongoose.model('User', {
            username: String,
            createdAt: { type: Date, default: Date.now }
        });

        const testUser = new User({ username: 'test_user_' + Date.now() });
        await testUser.save();
        console.log('Test user created:', testUser);

        // Fetch the user back
        const foundUser = await User.findById(testUser._id);
        console.log('Found user:', foundUser);

        await mongoose.connection.close();
        console.log('Connection closed');
    } catch (error) {
        console.error('Database test failed:', error);
    }
}

testConnection(); 