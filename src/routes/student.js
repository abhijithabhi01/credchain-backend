/**
 * Student Certificate Request Routes
 * ------------------------------------
 * POST  /api/student/login
 * POST  /api/student/request-certificate
 * GET   /api/student/request-status/:id
 */

const express   = require("express");
const router    = express.Router();
const jwt       = require("jsonwebtoken");
const crypto    = require("crypto");

const Student            = require("../models/Student");
const CertificateRequest = require("../models/CertificateRequest");

// ── JWT helpers ──────────────────────────────────────────────────────────────

const signStudentToken = (studentId) =>
  jwt.sign(
    { studentId, type: "student" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

// Middleware: verify the student JWT
const protectStudent = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }
    const token   = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== "student") {
      return res.status(403).json({ success: false, message: "Student token required." });
    }

    const student = await Student.findById(decoded.studentId);
    if (!student) {
      return res.status(401).json({ success: false, message: "Student not found." });
    }

    req.student = student;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
};

// ── Eligibility checker ──────────────────────────────────────────────────────

const checkEligibility = (student) => {
  if (!student.resultsPublished) {
    return { eligible: false, reason: "Your results have not been published yet." };
  }
  if (student.hasBacklogs) {
    return { eligible: false, reason: "You have pending backlogs. Please clear them before requesting a certificate." };
  }
  if (!student.degreeEligible) {
    return { eligible: false, reason: "You are not currently eligible for degree certification. Please contact the examination office." };
  }
  return { eligible: true, reason: null };
};

// ── Blockchain helper (reuse existing writeToBlockchain pattern) ──────────────

const writeToBlockchain = async (certId, ipfsHash, registerNumber, course, year) => {
  const optional = process.env.BLOCKCHAIN_OPTIONAL === "true";
  try {
    const { getContract } = require("../config/web3");
    const contract  = getContract();
    const tx        = await contract.issueCertificate(certId, ipfsHash, registerNumber, course, parseInt(year));
    const receipt   = await tx.wait();
    const issuerAddr = await contract.runner.getAddress();
    return {
      txHash:       receipt.hash,
      blockNumber:  receipt.blockNumber,
      issuerAddress: issuerAddr,
      mock: false,
    };
  } catch (err) {
    if (optional) {
      console.warn("[Blockchain] Skipping (BLOCKCHAIN_OPTIONAL=true):", err.message);
      return {
        txHash:      `mock-${crypto.randomBytes(16).toString("hex")}`,
        blockNumber: 0,
        mock: true,
      };
    }
    throw err;
  }
};

// ── POST /api/student/login ──────────────────────────────────────────────────
/**
 * Body: { registerNumber, dob }
 * DOB format: "YYYY-MM-DD"
 *
 * Returns: JWT token + student profile + eligibility status
 */
router.post("/login", async (req, res) => {
  try {
    const { registerNumber, dob } = req.body;

    if (!registerNumber || !dob) {
      return res.status(400).json({
        success: false,
        message: "registerNumber and dob are required.",
      });
    }

    const student = await Student.findOne({
      registerNumber: registerNumber.toUpperCase().trim(),
    });

    if (!student) {
      return res.status(401).json({
        success: false,
        message: "Invalid register number or date of birth.",
      });
    }

    // Compare DOB (stored as "YYYY-MM-DD" string)
    const normalizedDob = dob.trim();
    if (student.dob !== normalizedDob) {
      return res.status(401).json({
        success: false,
        message: "Invalid register number or date of birth.",
      });
    }

    const { eligible, reason } = checkEligibility(student);

    const token = signStudentToken(student._id);

    res.json({
      success: true,
      token,
      student: {
        id:             student._id,
        registerNumber: student.registerNumber,
        name:           student.name,
        email:          student.email,
        mobile:         student.mobile,
        course:         student.course,
        yearOfCompletion: student.yearOfCompletion,
      },
      eligibility: {
        eligible,
        reason,
        hasBacklogs:      student.hasBacklogs,
        resultsPublished: student.resultsPublished,
        degreeEligible:   student.degreeEligible,
      },
    });
  } catch (err) {
    console.error("[student/login]", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/student/request-certificate ────────────────────────────────────
/**
 * Requires Bearer token from /login
 * Body: { mobile, email, address, pincode, certificateType }
 *
 * Validates eligibility, creates a CertificateRequest,
 * and writes to blockchain if certificateType === "Degree Certificate".
 */
router.post("/request-certificate", protectStudent, async (req, res) => {
  try {
    const student = req.student;

    // Re-check eligibility at request time (status may have changed)
    const { eligible, reason } = checkEligibility(student);
    if (!eligible) {
      return res.status(403).json({
        success: false,
        message: reason,
        eligibility: {
          eligible: false,
          hasBacklogs:      student.hasBacklogs,
          resultsPublished: student.resultsPublished,
          degreeEligible:   student.degreeEligible,
        },
      });
    }

    const { mobile, email, address, pincode, certificateType } = req.body;

    // Basic validation
    const missing = ["mobile", "email", "address", "pincode", "certificateType"].filter(
      (f) => !req.body[f]
    );
    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    const ALLOWED_TYPES = [
      "Degree Certificate",
      "Provisional Certificate",
      "Transcript",
      "Migration Certificate",
      "Character Certificate",
    ];
    if (!ALLOWED_TYPES.includes(certificateType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid certificateType. Allowed: ${ALLOWED_TYPES.join(", ")}`,
      });
    }

    // Create the request document
    const certRequest = await CertificateRequest.create({
      student:        student._id,
      registerNumber: student.registerNumber,
      mobile,
      email,
      address,
      pincode,
      certificateType,
      status: "pending",
    });

    // ── Blockchain: write Degree Certificates immediately ────────────────
    let blockchainInfo = null;
    if (certificateType === "Degree Certificate") {
      try {
        const { v4: uuidv4 } = require("uuid");
        const blockchainCertId = `CERT-${uuidv4().toUpperCase()}`;
        // Use a placeholder IPFS hash if not yet uploaded
        const placeholderIpfs  = `pending-${crypto.randomBytes(8).toString("hex")}`;

        const bcResult = await writeToBlockchain(
          blockchainCertId,
          placeholderIpfs,
          student.registerNumber,
          student.course,
          student.yearOfCompletion || new Date().getFullYear()
        );

        await CertificateRequest.findByIdAndUpdate(certRequest._id, {
          txHash:           bcResult.txHash,
          blockNumber:      bcResult.blockNumber,
          blockchainCertId,
          ipfsHash:         placeholderIpfs,
          status:           "processing",
        });

        blockchainInfo = {
          certId:      blockchainCertId,
          txHash:      bcResult.txHash,
          blockNumber: bcResult.blockNumber,
          mock:        bcResult.mock,
        };
      } catch (bcErr) {
        console.error("[Blockchain] Degree cert write failed:", bcErr.message);
        // Don't fail the whole request — admin can retry
      }
    }

    const updated = await CertificateRequest.findById(certRequest._id);

    res.status(201).json({
      success: true,
      message: "Certificate request submitted successfully.",
      requestId:  updated.requestId,
      status:     updated.status,
      certificateType,
      submittedAt: updated.createdAt,
      ...(blockchainInfo && { blockchain: blockchainInfo }),
    });
  } catch (err) {
    console.error("[student/request-certificate]", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/student/request-status/:id ──────────────────────────────────────
/**
 * :id can be the requestId (REQ-XXXXXXXX) or MongoDB _id
 * Requires Bearer token — students can only see their own requests.
 */
router.get("/request-status/:id", protectStudent, async (req, res) => {
  try {
    const { id } = req.params;

    // Try requestId first, then _id
    let certRequest = await CertificateRequest.findOne({ requestId: id });
    if (!certRequest) {
      certRequest = await CertificateRequest.findById(id).catch(() => null);
    }

    if (!certRequest) {
      return res.status(404).json({ success: false, message: "Request not found." });
    }

    // Students can only see their own requests
    if (String(certRequest.student) !== String(req.student._id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    res.json({
      success: true,
      request: {
        requestId:       certRequest.requestId,
        certificateType: certRequest.certificateType,
        status:          certRequest.status,
        rejectionReason: certRequest.rejectionReason,
        submittedAt:     certRequest.createdAt,
        updatedAt:       certRequest.updatedAt,
        address:         certRequest.address,
        pincode:         certRequest.pincode,
        ...(certRequest.txHash && {
          blockchain: {
            txHash:      certRequest.txHash,
            blockNumber: certRequest.blockNumber,
            certId:      certRequest.blockchainCertId,
            ipfsHash:    certRequest.ipfsHash,
          },
        }),
      },
    });
  } catch (err) {
    console.error("[student/request-status]", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/student/my-requests ─────────────────────────────────────────────
// Bonus: list all requests for the logged-in student
router.get("/my-requests", protectStudent, async (req, res) => {
  try {
    const requests = await CertificateRequest.find({
      student: req.student._id,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count:   requests.length,
      requests: requests.map((r) => ({
        requestId:       r.requestId,
        certificateType: r.certificateType,
        status:          r.status,
        submittedAt:     r.createdAt,
        txHash:          r.txHash,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
