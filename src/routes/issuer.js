const express     = require("express");
const router      = express.Router();
const multer      = require("multer");
const { v4: uuidv4 } = require("uuid");
const crypto      = require("crypto");

const User        = require("../models/User");
const Certificate = require("../models/Certificate");
const ClaimToken  = require("../models/ClaimToken");
const CertificateRequest = require("../models/CertificateRequest");
const { protect, authorize }    = require("../middleware/auth");
const { uploadFileToPinata }    = require("../utils/pinata");
const { getContract }           = require("../config/web3");
const { log }                   = require("../utils/logger");
const {
  sendCertificateIssued,
  sendRevocationNotice,
} = require("../utils/emailService");

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") return cb(null, true);
    cb(new Error("Only PDF files are accepted."), false);
  },
});

router.use(protect, authorize("issuer"));

/**
 * Write to blockchain with graceful fallback when BLOCKCHAIN_OPTIONAL=true.
 * This fixes the "sender doesn't have enough funds" crash in local dev.
 */
const writeToBlockchain = async (certId, ipfsHash, studentRef, courseName, year) => {
  const optional = process.env.BLOCKCHAIN_OPTIONAL === "true";
  try {
    const contract = getContract();
    const tx = await contract.issueCertificate(
      certId, ipfsHash, studentRef, courseName, parseInt(year)
    );
    const receipt       = await tx.wait();
    const issuerAddress = await contract.runner.getAddress();
    return { txHash: receipt.hash, blockNumber: receipt.blockNumber, issuerAddress, mock: false };
  } catch (err) {
    if (optional) {
      console.warn("[Blockchain] Skipping (BLOCKCHAIN_OPTIONAL=true):", err.message);
      return {
        txHash:       `mock-${crypto.randomBytes(16).toString("hex")}`,
        blockNumber:  0,
        issuerAddress: "0x0000000000000000000000000000000000000000",
        mock: true,
      };
    }
    throw err;
  }
};

const revokeOnBlockchain = async (certId) => {
  const optional = process.env.BLOCKCHAIN_OPTIONAL === "true";
  try {
    const contract = getContract();
    const tx = await contract.revokeCertificate(certId);
    await tx.wait();
    return { mock: false };
  } catch (err) {
    if (optional) {
      console.warn("[Blockchain] Revoke skipped (BLOCKCHAIN_OPTIONAL=true):", err.message);
      return { mock: true };
    }
    throw err;
  }
};

router.get("/stats", async (req, res) => {
  try {
    const [totalIssued, pending, revoked] = await Promise.all([
      Certificate.countDocuments({ issuedBy: req.user._id, status: "issued" }),
      Certificate.countDocuments({ issuedBy: req.user._id, status: "pending" }),
      Certificate.countDocuments({ issuedBy: req.user._id, status: "revoked" }),
    ]);
    res.json({ success: true, stats: { totalIssued, pending, revoked } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/upload", upload.single("certificate"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "A PDF file is required (field name: certificate)." });
    }

    const certId   = uuidv4();
    const fileName = `cert-${certId}.pdf`;

    const { ipfsHash, ipfsUrl } = await uploadFileToPinata(req.file.buffer, fileName, certId);

    await log({
      action: "CERTIFICATE_UPLOADED", performedBy: req.user._id,
      performedByRole: "issuer", targetCertId: certId,
      details: { ipfsHash, fileName }, req,
    });

    res.json({ success: true, certId, ipfsHash, ipfsUrl,
      message: "PDF uploaded to IPFS. Now call POST /api/issuer/issue." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/issue", async (req, res) => {
  try {
    const {
      certId, ipfsHash, ipfsUrl,
      studentEmail, studentName, courseName, yearOfCompletion,
      grade, cgpa,
    } = req.body;

    if (!certId || !ipfsHash || !studentEmail || !courseName || !yearOfCompletion) {
      return res.status(400).json({
        success: false,
        message: "Required: certId, ipfsHash, studentEmail, courseName, yearOfCompletion.",
      });
    }

    const student = await User.findOne({ email: studentEmail.toLowerCase(), role: "student" });

    const { txHash, blockNumber, issuerAddress, mock } =
      await writeToBlockchain(
        certId, ipfsHash,
        student ? student._id.toString() : studentEmail,
        courseName, yearOfCompletion
      );

    const certificate = await Certificate.create({
      certId,
      ipfsHash,
      ipfsUrl:          ipfsUrl || `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
      studentId:        student?._id,
      studentName:      studentName || student?.name || "Unknown",
      studentEmail:     studentEmail.toLowerCase(),
      courseName,
      yearOfCompletion: parseInt(yearOfCompletion),
      grade,
      cgpa:             cgpa ? parseFloat(cgpa) : undefined,
      txHash,
      blockNumber,
      issuedByAddress:  issuerAddress,
      issuedBy:         req.user._id,
      status:           "issued",
    });

    // Generate claim token (24h magic link for student)
    const claimToken = await ClaimToken.create({
      certId,
      studentEmail: studentEmail.toLowerCase(),
      studentName:  studentName || student?.name || "Unknown",
    });

    // Send email — non-blocking, never crashes the request
    sendCertificateIssued({
      to:               studentEmail,
      studentName:      studentName || student?.name || "Student",
      courseName,
      yearOfCompletion: parseInt(yearOfCompletion),
      grade,
      certId,
      ipfsUrl:          certificate.ipfsUrl,
      claimToken:       claimToken.token,
    }).catch(err => console.error("[Email] sendCertificateIssued:", err.message));

    await log({
      action: "CERTIFICATE_ISSUED", performedBy: req.user._id,
      performedByRole: "issuer", targetCertId: certId,
      targetUserId: student?._id,
      details: { txHash, blockNumber, mock }, req,
    });

    res.status(201).json({
      success: true, certificate, txHash,
      blockchainMock: mock,
      message: mock
        ? "Certificate saved. Blockchain skipped (BLOCKCHAIN_OPTIONAL mode — fund wallet or deploy to testnet for real chain writes)."
        : "Certificate issued on blockchain and saved.",
    });
  } catch (error) {
    if (error.reason) {
      return res.status(400).json({ success: false, message: `Blockchain error: ${error.reason}` });
    }
    if (
      error.message?.toLowerCase().includes("sender doesn't have enough funds") ||
      error.message?.toLowerCase().includes("insufficient funds") ||
      error.message?.toLowerCase().includes("upfront cost")
    ) {
      return res.status(500).json({
        success: false,
        message:
          "Blockchain write failed: the issuer wallet has no ETH. " +
          "Quick fix: add BLOCKCHAIN_OPTIONAL=true to your .env file to skip blockchain in local dev. " +
          "For production, fund the wallet or use a testnet faucet.",
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/certificates", async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const query = { issuedBy: req.user._id };

    if (status) query.status = status;
    if (search) {
      query.$or = [
        { studentName:  { $regex: search, $options: "i" } },
        { certId:       { $regex: search, $options: "i" } },
        { studentEmail: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [certificates, total] = await Promise.all([
      Certificate.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Certificate.countDocuments(query),
    ]);

    res.json({
      success: true, certificates,
      pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/revoke/:certId", async (req, res) => {
  try {
    const { certId } = req.params;
    const { reason } = req.body;

    const certificate = await Certificate.findOne({ certId, issuedBy: req.user._id });
    if (!certificate) {
      return res.status(404).json({ success: false, message: "Certificate not found or you are not the original issuer." });
    }
    if (certificate.status === "revoked") {
      return res.status(400).json({ success: false, message: "Certificate is already revoked." });
    }

    await revokeOnBlockchain(certId);

    certificate.status       = "revoked";
    certificate.revokedAt    = new Date();
    certificate.revokeReason = reason || "Revoked by issuer";
    await certificate.save();

    // Notify student
    sendRevocationNotice({
      to:          certificate.studentEmail,
      studentName: certificate.studentName,
      courseName:  certificate.courseName,
      certId,
      reason:      certificate.revokeReason,
    }).catch(err => console.error("[Email] sendRevocationNotice:", err.message));

    await log({
      action: "CERTIFICATE_REVOKED", performedBy: req.user._id,
      performedByRole: "issuer", targetCertId: certId,
      details: { reason }, req,
    });

    res.json({ success: true, message: "Certificate revoked.", certificate });
  } catch (error) {
    if (error.reason) {
      return res.status(400).json({ success: false, message: `Blockchain error: ${error.reason}` });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/issuer/resend-claim/:certId
router.post("/resend-claim/:certId", async (req, res) => {
  try {
    const { certId }  = req.params;
    const certificate = await Certificate.findOne({ certId, issuedBy: req.user._id });
    if (!certificate) {
      return res.status(404).json({ success: false, message: "Certificate not found." });
    }

    await ClaimToken.updateMany({ certId, used: false }, { expiresAt: new Date() });
    const claimToken = await ClaimToken.create({
      certId,
      studentEmail: certificate.studentEmail,
      studentName:  certificate.studentName,
    });

    const { sendClaimLink } = require("../utils/emailService");
    await sendClaimLink({
      to:          certificate.studentEmail,
      studentName: certificate.studentName,
      certId,
      courseName:  certificate.courseName,
      claimToken:  claimToken.token,
    });

    res.json({ success: true, message: "Claim link resent to student." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// ── Certificate Request Management ──────────────────────────────────────────

// GET /api/issuer/certificate-requests — list all student certificate requests
router.get("/certificate-requests", async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const [requests, total] = await Promise.all([
      CertificateRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),
      CertificateRequest.countDocuments(filter),
    ]);

    res.json({ success: true, requests, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/issuer/certificate-requests/stats — counts per status
router.get("/certificate-requests/stats", async (req, res) => {
  try {
    const [pending, processing, approved, rejected, dispatched] = await Promise.all([
      CertificateRequest.countDocuments({ status: "pending" }),
      CertificateRequest.countDocuments({ status: "processing" }),
      CertificateRequest.countDocuments({ status: "approved" }),
      CertificateRequest.countDocuments({ status: "rejected" }),
      CertificateRequest.countDocuments({ status: "dispatched" }),
    ]);
    res.json({ success: true, stats: { pending, processing, approved, rejected, dispatched,
      total: pending + processing + approved + rejected + dispatched } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/issuer/certificate-requests/:id/status — approve / reject / dispatch
router.patch("/certificate-requests/:id/status", async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const ALLOWED = ["processing", "approved", "rejected", "dispatched"];
    if (!ALLOWED.includes(status)) {
      return res.status(400).json({ success: false,
        message: `Invalid status. Allowed: ${ALLOWED.join(", ")}` });
    }

    const certReq = await CertificateRequest.findById(req.params.id);
    if (!certReq) return res.status(404).json({ success: false, message: "Request not found." });

    certReq.status = status;
    if (status === "rejected" && rejectionReason) {
      certReq.rejectionReason = rejectionReason;
    }
    await certReq.save();

    await log({
      action: `REQUEST_${status.toUpperCase()}`,
      performedBy: req.user._id,
      performedByRole: "issuer",
      details: { requestId: certReq.requestId, certificateType: certReq.certificateType, status, rejectionReason },
      req,
    });

    res.json({ success: true, message: `Request ${status}.`, request: certReq });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;