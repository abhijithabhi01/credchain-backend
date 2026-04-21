const express     = require("express");
const router      = express.Router();

const Certificate = require("../models/Certificate");
const User        = require("../models/User");
const { protect, authorize }       = require("../middleware/auth");
const { getReadOnlyContract }      = require("../config/web3");
const { log }                      = require("../utils/logger");

// ── GET /api/public/verify/:certId ───────────────────────────
// Anyone can verify a certificate (no auth needed).
// Checks BOTH the blockchain (source of truth) and MongoDB.
router.get("/verify/:certId", async (req, res) => {
  try {
    const { certId } = req.params;

    // 1. Find in MongoDB
    const dbCert = await Certificate.findOne({ certId });
    if (!dbCert) {
      return res.status(404).json({
        success:  false,
        verified: false,
        message:  "Certificate not found in CredChain."
      });
    }

    // 2. Verify on blockchain
    let blockchainData    = null;
    let blockchainVerified = false;
    try {
      const contract = getReadOnlyContract();
      const result   = await contract.verifyCertificate(certId);

      blockchainVerified = result[0];      // isValid boolean
      blockchainData = {
        isValid:    result[0],
        ipfsHash:   result[1],
        issuedBy:   result[2],
        issuedAt:   new Date(Number(result[3]) * 1000).toISOString(),
        studentId:  result[4],
        courseName: result[5],
        year:       Number(result[6])
      };
    } catch (bcError) {
      // Blockchain unreachable — fall back to DB status with a warning
      console.error("[Blockchain] verify error:", bcError.message);
    }

    // Log the verification attempt
    await log({ action: "CERTIFICATE_VERIFIED", targetCertId: certId, req });

    // Determine overall validity
    const isValid      = blockchainData ? blockchainData.isValid : dbCert.status === "issued";
    const statusMatch  = blockchainData
      ? blockchainData.isValid === (dbCert.status === "issued")
      : true;

    res.json({
      success:  true,
      verified: isValid,
      status:   isValid ? "valid" : "revoked",
      certificate: {
        certId:           dbCert.certId,
        studentName:      dbCert.studentName,
        studentEmail:     dbCert.studentEmail,
        courseName:       dbCert.courseName,
        university:       dbCert.university,
        yearOfCompletion: dbCert.yearOfCompletion,
        grade:            dbCert.grade,
        ipfsUrl:          dbCert.ipfsUrl,
        issuedAt:         dbCert.createdAt,
        revokedAt:        dbCert.revokedAt,
        revokeReason:     dbCert.revokeReason,
        txHash:           dbCert.txHash
      },
      blockchain: blockchainData,
      warnings:   !statusMatch
        ? ["Status mismatch between blockchain and database. Please contact admin."]
        : []
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── GET /api/public/certificate/:certId ──────────────────────
// Full certificate details — used for the certificate detail page
router.get("/certificate/:certId", async (req, res) => {
  try {
    const certificate = await Certificate.findOne({ certId: req.params.certId })
      .populate("studentId", "name email studentId course")
      .populate("issuedBy",  "name university");

    if (!certificate) {
      return res.status(404).json({ success: false, message: "Certificate not found." });
    }

    res.json({ success: true, certificate });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── POST /api/public/link-certificate ────────────────────────
// Authenticated students link a certificate to their account.
// The certificate email must match the logged-in student's email.
router.post("/link-certificate", protect, authorize("student"), async (req, res) => {
  try {
    const { certId } = req.body;
    if (!certId) {
      return res.status(400).json({ success: false, message: "certId is required." });
    }

    const certificate = await Certificate.findOne({ certId });
    if (!certificate) {
      return res.status(404).json({ success: false, message: "Certificate not found." });
    }

    // Email must match — prevents students from claiming others' certs
    if (certificate.studentEmail !== req.user.email.toLowerCase()) {
      return res.status(403).json({
        success: false,
        message: "This certificate was not issued to your email address."
      });
    }

    // Link to student's account (addToSet prevents duplicates)
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { linkedCertificates: certificate._id } },
      { new: true }
    ).populate("linkedCertificates");

    // Back-fill studentId on cert if not yet set
    if (!certificate.studentId) {
      certificate.studentId = req.user._id;
      await certificate.save();
    }

    await log({
      action:          "CERTIFICATE_LINKED",
      performedBy:     req.user._id,
      performedByRole: "student",
      targetCertId:    certId,
      req
    });

    res.json({
      success: true,
      message: "Certificate successfully linked to your account.",
      linkedCertificates: user.linkedCertificates
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
