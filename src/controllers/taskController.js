const Task = require('../models/Task');
const User = require('../models/User');
const { sendEmail } = require('../services/emailService');

exports.createTask = async (req, res) => {
    try {
        const { title, description, dueDate, status, priority, assignedTo, type, company, color, recurrence, recurrenceEndDate, startTime, endTime, reminders } = req.body;
        const createdBy = req.userId;
        const task = new Task({
            title,
            description,
            dueDate,
            status,
            priority,
            assignedTo,
            createdBy,
            type,
            company,
            color,
            recurrence,
            recurrenceEndDate,
            startTime,
            endTime,
            reminders,
        });
        await task.save();

        // Send email notifications to all assignees (if delegated or meeting)
        if ((type === 'delegated' || type === 'meeting') && assignedTo && assignedTo.length > 0) {
            const assignees = await User.find({ _id: { $in: assignedTo } });
            const emails = assignees.map(user => user.email);
            let subject, text;
            if (type === 'delegated') {
                subject = `New Delegated Task: ${title}`;
                text = `You have been assigned a new task: ${title}\nDescription: ${description}\nDue: ${dueDate}\nCompany: ${company}`;
            } else if (type === 'meeting') {
                subject = `Meeting Scheduled: ${title}`;
                text = `You have been invited to a meeting: ${title}\nDescription: ${description}\nDate: ${dueDate} ${(startTime || endTime) ? `\nTime: ${startTime || ''} - ${endTime || ''}` : ''}\nOrganizer: ${createdBy}`;
            }
            try {
                await sendEmail(emails, subject, text);
            } catch (error) {
                // Log but do not block task creation
                console.error('Error sending email:', error);
            }
        }

        res.status(201).json(task);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// TODO: Enforce delegated and meeting workflow in updateTask (status transitions, permissions)
exports.getTasks = async (req, res) => {
    try {
        const userId = req.userId; // Assume set by auth middleware
        const { view, type, status } = req.query;
        let filter = {};
        if (view === 'outgoing') {
            filter.createdBy = userId;
        } else if (view === 'incoming') {
            filter.assignedTo = userId;
        } else {
            // Default: show all tasks user created or is assigned to
            filter.$or = [
                { createdBy: userId },
                { assignedTo: userId }
            ];
        }
        if (type) filter.type = type;
        if (status) filter.status = status;
        let tasks = await Task.find(filter).populate('assignedTo', 'name email').populate('createdBy', 'name email');

        // Auto-mark overdue tasks
        const now = new Date();
        const updates = [];
        tasks.forEach(task => {
            if (
                task.dueDate &&
                task.dueDate < now &&
                !['completed', 'overdue'].includes(task.status)
            ) {
                task.status = 'overdue';
                updates.push(task.save());
            }
        });
        if (updates.length) await Promise.all(updates);
        // Refetch tasks if any were updated
        if (updates.length) {
            tasks = await Task.find(filter).populate('assignedTo', 'name email').populate('createdBy', 'name email');
        }
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getTasksByDate = async (req, res) => {
    try {
        const userId = req.userId;
        const { date } = req.query; // Expecting 'YYYY-MM-DD'
        if (!date) return res.status(400).json({ error: 'Date is required' });
        const start = new Date(date);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        // Show tasks user created or is assigned to, on that date
        const filter = {
            $and: [
                {
                    $or: [
                        { createdBy: userId },
                        { assignedTo: userId }
                    ]
                },
                { dueDate: { $gte: start, $lte: end } }
            ]
        };
        const tasks = await Task.find(filter).populate('assignedTo', 'name email').populate('createdBy', 'name email');
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateTask = async (req, res) => {
    try {
        const taskId = req.params.id;
        const updates = req.body;
        const userId = req.userId; // Assume set by auth middleware
        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ error: 'Task not found' });

        // Only creator can edit, assign, or mark as completed
        const isOwner = task.createdBy.toString() === userId;
        let notifyAssignees = false;
        let updatedFields = [];
        if (!isOwner) {
            // Assignees can only update their own status for delegated/meeting tasks
            if (['delegated', 'meeting'].includes(task.type) && task.assignedTo.map(id => id.toString()).includes(userId)) {
                let updated = false;
                // Assignee can update status
                if (updates.status) {
                    if (updates.status === 'done') {
                        task.status = 'under_review';
                        updated = true;
                        notifyAssignees = true;
                        updatedFields.push('status');
                    } else if (['accepted', 'in_progress'].includes(updates.status)) {
                        task.status = updates.status;
                        updated = true;
                        notifyAssignees = true;
                        updatedFields.push('status');
                    } else {
                        return res.status(403).json({ error: 'Invalid status update for assignee' });
                    }
                }
                // Assignee can add progress notes
                if (updates.progressNote) {
                    task.progressNotes.push({ user: userId, note: updates.progressNote });
                    updated = true;
                    // Do not notify for progress notes only
                }
                if (!updated) {
                    return res.status(403).json({ error: 'Assignees can only update status or add progress notes' });
                }
            } else {
                return res.status(403).json({ error: 'Only the task owner can edit this task' });
            }
        } else {
            // Owner can update any field
            if (updates.status === 'completed') {
                task.status = 'completed';
                notifyAssignees = true;
                updatedFields.push('status');
            } else if (updates.status) {
                task.status = updates.status;
                notifyAssignees = true;
                updatedFields.push('status');
            }
            // Update other fields (except createdBy)
            Object.keys(updates).forEach(key => {
                if (key !== 'createdBy' && key !== 'status') {
                    task[key] = updates[key];
                    updatedFields.push(key);
                }
            });
        }
        await task.save();

        // Send update notification to assignees (except for progress notes only)
        if (notifyAssignees && task.assignedTo && task.assignedTo.length > 0) {
            const assignees = await User.find({ _id: { $in: task.assignedTo } });
            const emails = assignees.map(user => user.email);
            const subject = `Task Updated: ${task.title}`;
            const text = `The task "${task.title}" has been updated.\nUpdated fields: ${updatedFields.join(', ')}\nCurrent status: ${task.status}\nDescription: ${task.description || ''}`;
            try {
                await require('../services/emailService').sendEmail(emails, subject, text);
            } catch (error) {
                console.error('Error sending update notification:', error);
            }
        }

        res.json(task);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteTask = async (req, res) => {
    try {
        const taskId = req.params.id;
        const userId = req.userId; // Assume set by auth middleware
        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ error: 'Task not found' });
        if (task.createdBy.toString() !== userId) {
            return res.status(403).json({ error: 'Only the task owner can delete this task' });
        }
        await Task.findByIdAndDelete(taskId);
        res.json({ message: 'Task deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}; 