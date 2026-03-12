const db = require('../../config/dbConfig');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/authMiddleware');

const loginUser = (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err) {
            console.error("Database error during login:", err);
            return res.status(500).json({ error: 'Internal server error' });
        }
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Issue JWT
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' } // Token lasts 24 hours
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });
    });
};

const changePassword = async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id; // from authMiddleware

    if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: 'Old and new passwords are required' });
    }

    db.get(`SELECT password_hash FROM users WHERE id = ?`, [userId], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error fetching user' });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const validOld = await bcrypt.compare(oldPassword, user.password_hash);
        if (!validOld) {
            return res.status(401).json({ error: 'Incorrect old password' });
        }

        const salt = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(newPassword, salt);

        db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [newHash, userId], function(updateErr) {
            if (updateErr) return res.status(500).json({ error: 'Failed to update password' });
            res.json({ message: 'Password updated successfully' });
        });
    });
};

// ADMIN ONLY ROUTES
const createUser = async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const assignedRole = role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE';

    try {
        const salt = await bcrypt.genSalt(10);
        const hashed = await bcrypt.hash(password, salt);

        db.run(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`, 
        [username, hashed, assignedRole], 
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'Username already exists' });
                }
                return res.status(500).json({ error: 'Failed to create user' });
            }
            res.status(201).json({ 
                message: 'User created successfully',
                user: { id: this.lastID, username, role: assignedRole } 
            });
        });
    } catch (hashErr) {
        res.status(500).json({ error: 'Error processing password' });
    }
};

const fetchUsers = (req, res) => {
    // Only return non-sensitive fields
    db.all(`SELECT id, username, role, created_at FROM users`, [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to fetch users' });
        }
        res.json(rows);
    });
};

module.exports = {
    loginUser,
    changePassword,
    createUser,
    fetchUsers
};
