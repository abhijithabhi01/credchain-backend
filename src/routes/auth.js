const express = require("express");
const router  = express.Router();
const jwt     = require("jsonwebtoken");
const User    = require("../models/User");
const { protect }  = require("../middleware/auth");
const { log }      = require("../utils/logger");

// ── Helper ───────────────────────────────────────────────────
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  });

// ── POST /api/auth/register ──────────────────────────────────
// Students and employers register themselves.
// Admin and Issuer accounts are created via the seed script.
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, studentId, course, company, designation } = req.body;

    if (!["student", "employer"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Allowed values: 'student' or 'employer'."
      });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ success: false, message: "Email already registered." });
    }

    const user = await User.create({
      name,
      email,
      password,
      role,
      ...(role === "student"  && { studentId, course }),
      ...(role === "employer" && { company, designation })
    });

    await log({ action: "USER_REGISTERED", performedBy: user._id, performedByRole: role, req });

    res.status(201).json({ success: true, token: signToken(user._id), user });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "Email already registered." });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    // .select("+password") because password has select:false in schema
    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: "Account is deactivated." });
    }

    await log({ action: "USER_LOGIN", performedBy: user._id, performedByRole: user.role, req });

    res.json({ success: true, token: signToken(user._id), user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────────
router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate("linkedCertificates");
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── PUT /api/auth/profile ────────────────────────────────────
router.put("/profile", protect, async (req, res) => {
  try {
    const allowed = ["name", "course", "company", "designation"];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new:           true,
      runValidators: true
    });

    await log({ action: "PROFILE_UPDATED", performedBy: req.user._id, performedByRole: req.user.role, req });

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
