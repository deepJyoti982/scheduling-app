require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const connectDB = require('./config/dbConfig');
const auth = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());


// Import routes
const userRoutes = require('./routes/userRoutes');
const taskRoutes = require('./routes/taskRoutes');

// Use routes
// app.use('/api/users/profile', auth, userRoutes);
app.use('/api/tasks', auth, taskRoutes);
app.use('/api/users', userRoutes); // registration and login remain public

// Placeholder route
app.get('/', (req, res) => {
    res.send('Task Scheduler API is running');
});

// Initialize email reminder cron job
require('./services/emailReminderService');

connectDB();
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
