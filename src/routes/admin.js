const express     = require("express");
const router      = express.Router();
const User        = require("../models/User");
const Certificate = require("../models/Certificate");
const ActivityLog = require("../models/ActivityLog");
const { protect, authorize } = require("../middleware/auth");
const { log } = require("../utils/logger");

// All admin routes require a valid JWT with role = "admin"
router.use(protect, authorize("admin"));

// ── GET /api/admin/stats ─────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const [totalStudents, totalEmployers, totalIssuers, totalCerts, activeCerts, revokedCerts] =
      await Promise.all([
        User.countDocuments({ role: "student" }),
        User.countDocuments({ role: "employer" }),
        User.countDocuments({ role: "issuer" }),
        Certificate.countDocuments(),
        Certificate.countDocuments({ status: "issued" }),
        Certificate.countDocuments({ status: "revoked" })
      ]);

    res.json({
      success: true,
      stats: { totalStudents, totalEmployers, totalIssuers, totalCerts, activeCerts, revokedCerts }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── GET /api/admin/issuers ───────────────────────────────────
router.get("/issuers", async (req, res) => {
  try {
    const issuers = await User.find({ role: "issuer" });
    res.json({ success: true, issuers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── POST /api/admin/issuers ──────────────────────────────────
// Admin can add a new university issuer account
router.post("/issuers", async (req, res) => {
  try {
    const { name, email, password, university } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "name, email, and password are required."
      });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ success: false, message: "Email already in use." });
    }

    const issuer = await User.create({ name, email, password, role: "issuer", university });

    await log({
      action: "ISSUER_ADDED",
      performedBy: req.user._id,
      performedByRole: "admin",
      targetUserId: issuer._id,
      req
    });

    res.status(201).json({ success: true, issuer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── DELETE /api/admin/issuers/:issuerId ──────────────────────
router.delete("/issuers/:issuerId", async (req, res) => {
  try {
    const issuer = await User.findOneAndDelete({ _id: req.params.issuerId, role: "issuer" });
    if (!issuer) {
      return res.status(404).json({ success: false, message: "Issuer not found." });
    }

    await log({
      action: "ISSUER_REMOVED",
      performedBy: req.user._id,
      performedByRole: "admin",
      targetUserId: issuer._id,
      req
    });

    res.json({ success: true, message: "Issuer removed successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── GET /api/admin/certificates ──────────────────────────────
// All certificates with optional filters: status, search, pagination
router.get("/certificates", async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const query = {};

    if (status) query.status = status;
    if (search) {
      query.$or = [
        { studentName:  { $regex: search, $options: "i" } },
        { certId:       { $regex: search, $options: "i" } },
        { studentEmail: { $regex: search, $options: "i" } },
        { courseName:   { $regex: search, $options: "i" } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [certificates, total] = await Promise.all([
      Certificate.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("studentId", "name email")
        .populate("issuedBy", "name university"),
      Certificate.countDocuments(query)
    ]);

    res.json({
      success: true,
      certificates,
      pagination: {
        total,
        page:  Number(page),
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── GET /api/admin/logs ──────────────────────────────────────
router.get("/logs", async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      ActivityLog.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("performedBy", "name email role"),
      ActivityLog.countDocuments()
    ]);

    res.json({
      success: true,
      logs,
      pagination: {
        total,
        page:  Number(page),
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
