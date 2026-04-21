/**
 * POST /api/claim
 *   body: { token }
 *
 * Validates the magic-link token, creates/finds the student account,
 * links the certificate, marks token as used, returns a JWT.
 */
const express     = require("express");
const router      = express.Router();
const jwt         = require("jsonwebtoken");
const crypto      = require("crypto");

const ClaimToken  = require("../models/ClaimToken");
const Certificate = require("../models/Certificate");
const User        = require("../models/User");
const { log }     = require("../utils/logger");

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

// GET /api/claim/validate?token=xxx  — check token without consuming it
router.get("/validate", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, message: "token is required." });

    const ct = await ClaimToken.findOne({ token });
    if (!ct)                        return res.status(404).json({ success: false, valid: false, message: "Invalid claim link." });
    if (ct.used)                    return res.status(410).json({ success: false, valid: false, message: "This claim link has already been used." });
    if (ct.expiresAt < new Date())  return res.status(410).json({ success: false, valid: false, message: "This claim link has expired. Request a new one from your institution." });

    const certificate = await Certificate.findOne({ certId: ct.certId });
    res.json({
      success: true, valid: true,
      preview: {
        certId:      ct.certId,
        studentName: ct.studentName,
        courseName:  certificate?.courseName,
        yearOfCompletion: certificate?.yearOfCompletion,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/claim  — consume token, log in (or create account), link cert
router.post("/", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: "token is required." });

    // Validate token
    const ct = await ClaimToken.findOne({ token });
    if (!ct)                       return res.status(404).json({ success: false, message: "Invalid claim link." });
    if (ct.used)                   return res.status(410).json({ success: false, message: "This claim link has already been used." });
    if (ct.expiresAt < new Date()) return res.status(410).json({ success: false, message: "This claim link has expired. Ask your issuer to resend it." });

    // Find the certificate
    const certificate = await Certificate.findOne({ certId: ct.certId });
    if (!certificate) return res.status(404).json({ success: false, message: "Certificate not found." });

    // Find or create student account
    let user = await User.findOne({ email: ct.studentEmail, role: "student" });
    let isNewUser = false;

    if (!user) {
      // Create account with a random strong password (student uses magic link, not password login)
      const tempPassword = crypto.randomBytes(20).toString("hex");
      user = await User.create({
        name:     ct.studentName || "Student",
        email:    ct.studentEmail,
        password: tempPassword,
        role:     "student",
      });
      isNewUser = true;
    }

    // Link certificate to student
    await User.findByIdAndUpdate(user._id, {
      $addToSet: { linkedCertificates: certificate._id },
    });

    // Back-fill studentId on certificate if not yet set
    if (!certificate.studentId) {
      certificate.studentId = user._id;
      await certificate.save();
    }

    // Mark token as used
    ct.used   = true;
    ct.usedAt = new Date();
    await ct.save();

    await log({
      action:          "CERTIFICATE_LINKED",
      performedBy:     user._id,
      performedByRole: "student",
      targetCertId:    ct.certId,
      targetUserId:    user._id,
      details:         { claimedViaToken: true, isNewUser },
      req,
    });

    // Return JWT so the frontend can log the student in immediately
    const jwtToken = signToken(user._id);
    const freshUser = await User.findById(user._id).populate("linkedCertificates");

    res.json({
      success: true,
      isNewUser,
      message: isNewUser
        ? "Account created and certificate claimed successfully."
        : "Certificate linked to your existing account.",
      token: jwtToken,
      user:  freshUser,
      certificate,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
