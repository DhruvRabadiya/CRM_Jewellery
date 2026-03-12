const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'jewelcrm_super_secret_key_123';

// Extractor middleware to parse token into req.user
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    // Header Format: Bearer <token>
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access Denied: No Authentication Token Provided' });
    }

    try {
        const verifiedUser = jwt.verify(token, JWT_SECRET);
        req.user = verifiedUser; // Attach the JWT payload {id, username, role}
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Access Denied: Invalid or Expired Token' });
    }
};

// Role-based authorization middleware
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access Denied: Requires Administrator Privileges' });
    }
    next();
};

module.exports = {
    authenticateToken,
    requireAdmin,
    JWT_SECRET
};
