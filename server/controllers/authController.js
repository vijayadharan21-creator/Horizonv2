import User from '../models/User.js';
import {
  generateTokens,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
} from '../utils/jwt.js';

export const SEED_USERS = [
  {
    name: 'Sarah Jenkins',
    email: 'pm@taskforge.ai',
    password: 'Password@123',
    role: 'project_manager',
    skills: ['Project Planning', 'Resource Allocation', 'Sprint Planning'],
    subSkills: ['Agile Architecture', 'Risk Assessment', 'Capacity Balancing', 'Scrum Roadmap'],
  },
  {
    name: 'Alex Rivera',
    email: 'dev@taskforge.ai',
    password: 'Password@123',
    role: 'developer',
    skills: ['Node.js', 'React', 'MongoDB', 'Python'],
    subSkills: ['React State Management', 'REST API Optimization', 'MongoDB Schema Modeling', 'Component Design', 'Express Middleware'],
  },
];

/**
 * Seed initial accounts into MongoDB if not existing
 */
export const seedDefaultUsers = async () => {
  try {
    for (const seed of SEED_USERS) {
      const existing = await User.findOne({ email: seed.email });
      if (!existing) {
        // Use User.create() which triggers pre-save hook for password hashing
        await User.create({
          name: seed.name,
          email: seed.email,
          password: seed.password,
          role: seed.role,
          skills: seed.skills,
          subSkills: seed.subSkills,
        });
        console.log(`[TaskForge Seeder] Created: ${seed.email} (${seed.role})`);
      } else {
        if (!existing.subSkills || existing.subSkills.length === 0) {
          existing.subSkills = seed.subSkills;
          await existing.save();
        }
        console.log(`[TaskForge Seeder] Already exists: ${seed.email}`);
      }
    }
  } catch (error) {
    console.error(`[TaskForge Seeder] Error:`, error.message);
  }
};

/**
 * POST /api/auth/register
 */
export const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters.',
      });
    }

    const assignedRole = role === 'project_manager' ? 'project_manager' : 'developer';
    const sanitizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: sanitizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists. Please sign in instead.',
      });
    }

    // Create user — pre-save hook hashes the password
    const newUser = await User.create({
      name: name.trim(),
      email: sanitizedEmail,
      password,
      role: assignedRole,
    });

    // Generate Dual Tokens
    const { accessToken, refreshToken } = generateTokens(newUser);

    // Save refresh token to DB (without triggering password hash again)
    await User.findByIdAndUpdate(newUser._id, { refreshToken });

    // Set HTTP-Only Cookies
    setAuthCookies(res, accessToken, refreshToken);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      user: newUser.toSafeObject(),
      accessToken,
    });
  } catch (error) {
    console.error('Registration error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during registration.',
    });
  }
};

/**
 * POST /api/auth/login
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password.',
      });
    }

    const sanitizedEmail = email.toLowerCase().trim();

    // Must explicitly select password and refreshToken (both are select:false)
    const user = await User.findOne({ email: sanitizedEmail }).select('+password +refreshToken');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Generate Dual Tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Save refresh token — use findByIdAndUpdate to avoid triggering pre-save hook
    await User.findByIdAndUpdate(user._id, { refreshToken });

    // Set HTTP-Only cookies
    setAuthCookies(res, accessToken, refreshToken);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      user: user.toSafeObject(),
      accessToken,
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error during login.',
    });
  }
};

/**
 * POST /api/auth/refresh
 */
export const refreshToken = async (req, res) => {
  try {
    const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!incomingRefreshToken) {
      return res.status(401).json({
        success: false,
        message: 'No refresh token found. Please log in again.',
        code: 'NO_REFRESH_TOKEN',
      });
    }

    const { valid, decoded, expired } = verifyRefreshToken(incomingRefreshToken);

    if (!valid || expired || !decoded) {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    const user = await User.findById(decoded.id).select('+refreshToken');

    if (!user || !user.refreshToken || user.refreshToken !== incomingRefreshToken) {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: 'Session revoked or expired. Please log in again.',
        code: 'REVOKED_REFRESH_TOKEN',
      });
    }

    // Issue new tokens (rotation)
    const tokens = generateTokens(user);
    await User.findByIdAndUpdate(user._id, { refreshToken: tokens.refreshToken });

    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    return res.status(200).json({
      success: true,
      message: 'Session refreshed successfully',
      user: user.toSafeObject(),
      accessToken: tokens.accessToken,
    });
  } catch (error) {
    console.error('Refresh token error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error during token refresh.',
    });
  }
};

/**
 * POST /api/auth/logout
 */
export const logout = async (req, res) => {
  try {
    const incomingRefreshToken = req.cookies?.refreshToken;
    if (incomingRefreshToken) {
      await User.findOneAndUpdate(
        { refreshToken: incomingRefreshToken },
        { refreshToken: null }
      );
    }

    clearAuthCookies(res);
    return res.status(200).json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    console.error('Logout error:', error.message);
    clearAuthCookies(res);
    return res.status(200).json({ success: true, message: 'Logged out.' });
  }
};

/**
 * GET /api/auth/me
 */
export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.status(200).json({ success: true, user: user.toSafeObject() });
  } catch (error) {
    console.error('Get profile error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve profile.' });
  }
};

/**
 * GET /api/auth/demo-accounts
 */
export const getSeedAccounts = async (req, res) => {
  return res.status(200).json({
    success: true,
    accounts: [
      { role: 'project_manager', label: 'Project Manager', email: 'pm@taskforge.ai', password: 'Password@123' },
      { role: 'developer', label: 'Developer', email: 'dev@taskforge.ai', password: 'Password@123' },
    ],
  });
};
