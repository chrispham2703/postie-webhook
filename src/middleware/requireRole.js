function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!allowedRoles.includes(req.role)) {
            return res.status(403).json({
                error: { code: 'FORBIDDEN', message: `Requires one of role(s): ${allowedRoles.join(', ')}` },
            });
        }
        next();
    };
}

module.exports = { requireRole };
