const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    dueDate: { type: Date },
    status: { type: String, enum: ['pending', 'accepted', 'in_progress', 'done', 'under_review', 'completed', 'overdue'], default: 'pending' },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['personal', 'delegated', 'meeting', 'week-off'], default: 'personal' },
    company: { type: String },
    time: { type: String }, // e.g., '14:00'
    color: { type: String, enum: ['Red', 'Green', 'Blue', 'Yellow'] },
    recurrence: { type: String, enum: ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'], default: 'none' },
    recurrenceEndDate: { type: Date },
    progressNotes: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: { type: String },
        timestamp: { type: Date, default: Date.now }
    }],
    remindersSent: { type: Object, default: {} },
    startTime: { type: String }, // e.g., '09:00'
    endTime: { type: String },   // e.g., '10:00'
    reminders: [{ type: String }], // e.g., ['5m', '15m']
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema); 