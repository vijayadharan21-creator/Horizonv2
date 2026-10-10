import User from '../models/User.js';

/**
 * GET /api/users/developers
 * Returns all registered developer accounts (for PM task assignment dropdown)
 */
export const getDevelopers = async (req, res) => {
  try {
    const developers = await User.find({ role: 'developer' })
      .select('name email skills subSkills availability createdAt')
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      developers: developers.map((d) => ({
        id: d._id.toString(),
        name: d.name,
        email: d.email,
        skills: d.skills || [],
        subSkills: d.subSkills || [],
        availability: d.availability || { status: 'available', from: null, to: null, reason: '' },
      })),
    });
  } catch (error) {
    console.error('[Users] getDevelopers error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch developers.' });
  }
};

/**
 * PUT /api/users/profile
 * Update logged-in user's profile (name, skills, subSkills)
 */
export const updateProfile = async (req, res) => {
  try {
    const { name, skills, subSkills, primarySkills, secondarySkills } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (name?.trim()) user.name = name.trim();

    if (Array.isArray(skills)) {
      user.skills = skills.filter(Boolean);
    } else if (primarySkills !== undefined || secondarySkills !== undefined) {
      const allSkills = [
        ...(Array.isArray(primarySkills) ? primarySkills : []),
        ...(Array.isArray(secondarySkills) ? secondarySkills : []),
      ].filter(Boolean);
      user.skills = allSkills;
    }

    // Automatically derive and store subSkills based on the updated skills
    const derivedSubSkills = [];
    user.skills.forEach((s) => {
      const lower = s.toLowerCase();
      if (lower.includes('react') || lower.includes('frontend')) {
        derivedSubSkills.push('React State Management', 'Component Architecture', 'Tailwind CSS', 'UI Optimization');
      } else if (lower.includes('node') || lower.includes('backend')) {
        derivedSubSkills.push('REST API Optimization', 'Express Middleware', 'Backend Architecture');
      } else if (lower.includes('mongo') || lower.includes('database')) {
        derivedSubSkills.push('MongoDB Schema Modeling', 'Query Optimization', 'Database Indexing');
      } else if (lower.includes('python')) {
        derivedSubSkills.push('Data Processing', 'API Integration', 'Script Automation');
      } else if (lower.includes('plan') || lower.includes('agile')) {
        derivedSubSkills.push('Sprint Architecture', 'Capacity Planning', 'Risk Mitigation');
      } else {
        derivedSubSkills.push(`${s} Optimization`, `${s} Architecture`);
      }
    });

    user.subSkills = Array.from(new Set(derivedSubSkills));

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error('[Users] updateProfile error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
};

/**
 * PUT /api/users/password
 * Change own password
 */
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters.',
      });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    user.password = newPassword;
    await user.save(); // Pre-save hook hashes it

    return res.status(200).json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    console.error('[Users] changePassword error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to change password.' });
  }
};
