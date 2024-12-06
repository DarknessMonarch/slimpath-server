const express = require('express');
const {
    login,
    logout,
    register,
    getAllUsers,
    refreshToken,
    deleteAccount,
    resetPassword,
    updatePassword,
    updateProfileImage,
    toggleAuthorization,
    resetPasswordRequest,
    updateUsernameOrEmail,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/login', login);
router.get('/users', getAllUsers);
router.post('/register', register);
router.post('/reset', resetPassword);
router.post('/logout', protect, logout);
router.post('/refresh-token', refreshToken);
router.put('/password', protect, updatePassword);
router.post('/reset-link', resetPasswordRequest);
router.put('/update', protect, updateUsernameOrEmail);
router.post('/authorize', protect, toggleAuthorization);
router.put('/profile-image', protect, updateProfileImage);
router.delete('/delete', protect, deleteAccount);

module.exports = router;
