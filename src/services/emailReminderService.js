const cron = require('node-cron');
const Task = require('../models/Task');
const User = require('../models/User');
const { sendEmail } = require('./emailService');

// Reminder intervals in minutes and their labels
const REMINDER_INTERVALS = [
    { label: '1d', minutes: 1440 },
    { label: '1h', minutes: 60 },
    { label: '30m', minutes: 30 },
    { label: '15m', minutes: 15 },
    { label: '5m', minutes: 5 },
];

// Helper to get event DateTime from dueDate and startTime
function getEventDateTime(task) {
    if (task.dueDate && task.startTime) {
        // Combine date and time (assume UTC for now)
        return new Date(`${task.dueDate.toISOString().slice(0, 10)}T${task.startTime}:00.000Z`);
    } else if (task.dueDate) {
        return new Date(task.dueDate);
    }
    return null;
}

// Run every minute
cron.schedule('* * * * *', async () => {
    const now = new Date();
    for (const interval of REMINDER_INTERVALS) {
        const target = new Date(now.getTime() + interval.minutes * 60000);
        // Find tasks not completed/overdue, and not already reminded
        const tasks = await Task.find({
            status: { $nin: ['completed', 'overdue'] },
            [`remindersSent.${interval.label}`]: { $ne: true },
        });
        for (const task of tasks) {
            const eventDateTime = getEventDateTime(task);
            if (!eventDateTime) continue;
            // Check if eventDateTime is within the target window
            if (eventDateTime >= new Date(target.getTime() - 60000) && eventDateTime < target) {
                if (task.assignedTo && task.assignedTo.length > 0) {
                    const assignees = await User.find({ _id: { $in: task.assignedTo } });
                    const emails = assignees.map(user => user.email);
                    const subject = `Task Reminder: ${task.title}`;
                    const text = `Reminder: Task "${task.title}" is due at ${eventDateTime.toLocaleString()}\nDescription: ${task.description || ''}`;
                    try {
                        await sendEmail(emails, subject, text);
                        // Mark this reminder as sent
                        if (!task.remindersSent) task.remindersSent = {};
                        task.remindersSent[interval.label] = true;
                        await task.save();
                    } catch (error) {
                        console.error('Error sending reminder email:', error);
                    }
                }
            }
        }
    }
}); 