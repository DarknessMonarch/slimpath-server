const cloudinary = require('../config/cloudinary');
const User = require('../models/userModel');
const crypto = require('crypto');
const { generateReferralCode } = require('../helpers/refferalCodeHelper');
const  { sendWelcomeEmail, sendResetEmail } = require('../helpers/authHelper');


const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
};



exports.register = async (req, res) => {
  try {
    const { username, email, password, referredBy } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Username, email, and password are required'
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email format'
      });
    }

    // Validate password strength
    if (!validatePassword(password)) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 8 characters long and include uppercase, lowercase, number, and special character.'
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        status: 'error',
        message: 'User with this email already exists'
      });
    }

    const newUser = new User({
      username,
      email,
      password,
      referredBy
    });

    // Handle referral logic
    if (referredBy) {
      const referrer = await User.findOne({ referralCode: referredBy });
      if (referrer) {
        referrer.referrals.push(newUser._id);
        referrer.isAuthorized = referrer.referrals.length >= 2;
        await referrer.save();
      }
    }

    await newUser.save();
    sendWelcomeEmail(email, username);

    const refreshToken = newUser.generateRefreshToken();
    await newUser.save();

    res.status(201).json({
      status: 'success',
      message: 'User registered successfully',
      data: {
        userId: newUser._id,
        username: newUser.username,
        email: newUser.email,
        referralCode: newUser.referralCode,
        isAuthorized: newUser.isAuthorized,
        profileImage: newUser.profileImage,
        refreshToken: refreshToken,
        accessToken: newUser.generateToken()
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error during registration',
      details: error.message
    });
  }
};


// Refresh token endpoint
exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  try {
    const user = await User.findOne({ refreshToken });

    if (!user || !user.isRefreshTokenValid()) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired refresh token'
      });
    }

    // Generate new tokens
    const accessToken = user.generateToken();
    const newRefreshToken = user.generateRefreshToken();
    await user.save();

    res.status(200).json({
      status: 'success',
      data: {
        accessToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error during token refresh'
    });
  }
};

// Login user
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid credentials'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({
        status: 'error',
        message: 'password does not match'
      });
    }

    // Check if user is authorized
    // if (!user.isAuthorized) {
    //   return res.status(403).json({ 
    //     status: 'error',
    //     message: 'User not authorized' 
    //   });
    // }

    // Generate new refresh token
    const refreshToken = user.generateRefreshToken();

    user.lastLogin = new Date();
    await user.save();

    const accessToken = user.generateToken();

    res.status(200).json({
      status: 'success',
      message: 'Login successful',
      data: {
        userId: user._id,
        username: user.username,
        email: user.email,
        referralCode: user.referralCode,
        isAuthorized: user.isAuthorized,
        profileImage: user.profileImage,
        refreshToken: refreshToken,
        accessToken: accessToken,
        lastLogin: user.lastLogin
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error during login',
      details: error.message
    });
  }
};

exports.logout = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });

    if (user) {
      user.invalidateRefreshToken();
      await user.save();
    }

    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error during logout',
      details: error.message
    });
  }
};

// Update username or email
exports.updateUsernameOrEmail = async (req, res) => {
  try {
    const userId = req.user._id;
    const { newUsername, newEmail } = req.body;

    let updateFields = {};
    
    if (newUsername) {
      updateFields.username = newUsername;
      updateFields.referralCode = await generateReferralCode(newUsername);
    }

    if (newEmail) {
      // Validate email format
      if (!validateEmail(newEmail)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid email format'
        });
      }

      const existingUser = await User.findOne({ email: newEmail });
      if (existingUser) {
        return res.status(409).json({
          status: 'error',
          message: 'Email already in use'
        });
      }

      updateFields.email = newEmail;
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Either username or email must be provided'
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateFields,
      { new: true }
    );

    res.status(200).json({ 
      status: 'success',
      message: 'Profile updated successfully', 
      user: {
        userId: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        referralCode: updatedUser.referralCode,
        isAuthorized: updatedUser.isAuthorized,
        profileImage: updatedUser.profileImage
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Server error during profile update',
      details: error.message 
    });
  }
};

// Update password
exports.updatePassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { oldPassword, newPassword } = req.body;

    // Validate new password
    if (!validatePassword(newPassword)) {
      return res.status(400).json({
        status: 'error',
        message: 'New password does not meet strength requirements'
      });
    }

    const user = await User.findById(userId);
    const isMatch = await user.comparePassword(oldPassword);

    if (!isMatch) {
      return res.status(400).json({
        status: 'error',
        message: 'Current password is incorrect'
      });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({ 
      status: 'success',
      message: 'Password updated successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      message: 'Server error during password update',
      details: error.message 
    });
  }
};

exports.toggleAuthorization = async (req, res) => {
  try {
    const { email, isAuthorized } = req.body;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is required'
      });
    }

    if (typeof isAuthorized !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid authorization status. Must be a boolean value.'
      });
    }

    const user = await User.findOneAndUpdate(
      { email },
      { isAuthorized },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'User authorization status updated successfully',
      data: {
        userId: newUser._id,
        email: user.email,
        isAuthorized: user.isAuthorized
      }
    });
  } catch (error) {
    console.error('Toggle authorization error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error during authorization toggle',
      details: error.message
    });
  }
};

// Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password -refreshToken');
    res.status(200).json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};



// Password reset request
exports.resetPasswordRequest = async (req, res) => {
  try {
    const { email } = req.body;

    if (!validateEmail(email)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email format'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'No account associated with this email'
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour from now

    // Save token and expiry to user document
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpiry = resetTokenExpiry;
    await user.save();

    sendResetEmail(user.username, email, resetToken);

    res.status(200).json({
      status: 'success',
      message: 'Password reset link sent to your email'
    });
  } catch (error) {
    console.error('Reset password request error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error during password reset request',
      details: error.message
    });
  }
};

// Reset password
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!validatePassword(newPassword)) {
      return res.status(400).json({
        status: 'error',
        message: 'New password does not meet strength requirements'
      });
    }

    // Find user by reset token and check expiry
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired reset token'
      });
    }

    // Update user password and clear reset token
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpiry = undefined;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Password reset successful'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error during password reset',
      details: error.message
    });
  }
};

// Update profile image
exports.updateProfileImage = async (req, res) => {
  try {
    const userId = req.user._id;
    const { image } = req.body;
    
    // Validate image input
    if (!image) {
      return res.status(400).json({
        status: 'error',
        message: 'No image provided'
      });
    }

    if (!image.startsWith('data:image/')) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid image format. Must be a valid base64 image string'
      });
    }

    const uploadOptions = {
      folder: 'profile',
      allowed_formats: ['jpg', 'png', 'jpeg', 'gif'],
      transformation: { width: 500, height: 500, crop: 'fill' }
    };

    let result;
    try {
      result = await cloudinary.uploader.upload(image, uploadOptions);
    } catch (cloudinaryError) {
      console.error('Cloudinary upload error:', cloudinaryError);
      return res.status(400).json({
        status: 'error',
        message: 'Failed to upload image to cloud storage',
        details: cloudinaryError.message
      });
    }


    // Update user with new profile image URL
    const user = await User.findByIdAndUpdate(
      userId, 
      { profileImage: result.secure_url }, 
      { new: true }
    ).select('-password -refreshToken');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Profile image updated successfully',
      user: {
        profileImage: user.profileImage,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Profile image update error:', {
      message: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      status: 'error',
      message: 'Error updating profile image',
      details: error.message
    });
  }
};

// Delete account
exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;
    await User.findByIdAndDelete(userId);
    res.status(200).json({ message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};