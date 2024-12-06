const jwt = require('jsonwebtoken');
const User = require('../models/userModel');

exports.protect = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required. Please provide a valid token.'
            });
        }

        const token = authHeader.split(' ')[1];

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Find user with decoded email
            const user = await User.findOne({ email: decoded.email })
                .select('-password -refreshToken -resetPasswordToken -resetPasswordExpiry');

            if (!user) {
                return res.status(401).json({
                    status: 'error',
                    message: 'User no longer exists'
                });
            }

            // Check if user is authorized (if you want to keep this check)
            // if (!user.isAuthorized) {
            //     return res.status(403).json({
            //         status: 'error',
            //         message: 'Account not authorized'
            //     });
            // }

            // Attach user to request object
            req.user = user;
            next();

        } catch (jwtError) {
            // Handle different JWT errors
            if (jwtError.name === 'TokenExpiredError') {
                return res.status(401).json({
                    status: 'error',
                    message: 'Token has expired',
                    code: 'TOKEN_EXPIRED',
                    shouldRefresh: true
                });
            }
            
            if (jwtError.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    status: 'error',
                    message: 'Invalid token',
                    code: 'INVALID_TOKEN'
                });
            }

            return res.status(401).json({
                status: 'error',
                message: 'Token verification failed',
                code: 'TOKEN_VERIFICATION_FAILED'
            });
        }

    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Internal server error during authentication',
            code: 'AUTH_ERROR'
        });
    }
};

