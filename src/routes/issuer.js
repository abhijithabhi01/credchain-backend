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

// ── Multer: optional PDF (used only on approve) ──────────────────────────────
// We make the file optional here; the route handler enforces it when status=approved.
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

// ── Stats ────────────────────────────────────────────────────────────────────

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

// ── Upload only (kept for standalone use) ────────────────────────────────────

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

// ── Issue only (kept for standalone use) ────────────────────────────────────

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

    const claimToken = await ClaimToken.create({
      certId,
      studentEmail: studentEmail.toLowerCase(),
      studentName:  studentName || student?.name || "Unknown",
    });

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
        ? "Certificate saved. Blockchain skipped (BLOCKCHAIN_OPTIONAL mode)."
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

// ── List certificates ────────────────────────────────────────────────────────

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

// ── Revoke ───────────────────────────────────────────────────────────────────

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

// ── Resend claim link ────────────────────────────────────────────────────────

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

// GET /api/issuer/certificate-requests
router.get("/certificate-requests", async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const [requests, total] = await Promise.all([
      CertificateRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .populate(
          "student",
          "name registerNumber course yearOfCompletion cgpa totalCredits " +
          "hasBacklogs resultsPublished degreeEligible subjects documents email mobile"
        )
        .lean(),
      CertificateRequest.countDocuments(filter),
    ]);

    res.json({ success: true, requests, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/issuer/certificate-requests/stats
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

/**
 * PATCH /api/issuer/certificate-requests/:id/status
 *
 * For status = "approved":
 *   • Requires a PDF file upload (field name: "certificate")
 *   • Uploads PDF to IPFS via Pinata
 *   • Issues the certificate on the blockchain
 *   • Creates a Certificate document + ClaimToken
 *   • Updates the CertificateRequest with blockchain refs
 *   • Sends the certificate-issued email with claim link to the student
 *
 * For status = "rejected" | "processing" | "dispatched":
 *   • Works the same as before (no file required)
 *
 * Content-Type must be multipart/form-data when approving.
 * Send `status` as a form field alongside the file.
 */
router.patch(
  "/certificate-requests/:id/status",
  upload.single("certificate"),   // optional; enforced below when status=approved
  async (req, res) => {
    try {
      const { status, rejectionReason } = req.body;
      const ALLOWED = ["processing", "approved", "rejected", "dispatched"];

      if (!ALLOWED.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Allowed: ${ALLOWED.join(", ")}`,
        });
      }

      // ── Fetch request + populate student ──────────────────────────────────
      const certReq = await CertificateRequest.findById(req.params.id).populate(
        "student",
        "name email mobile course yearOfCompletion cgpa grade"
      );
      if (!certReq) {
        return res.status(404).json({ success: false, message: "Request not found." });
      }

      // ── APPROVE: full pipeline ─────────────────────────────────────────────
      if (status === "approved") {
        if (!req.file) {
          return res.status(400).json({
            success: false,
            message:
              "A PDF certificate file is required when approving a request. " +
              "Send it as multipart/form-data with field name 'certificate'.",
          });
        }

        const student = certReq.student;   // populated above

        // Derive student details — fall back to request-level fields
        const studentName      = student?.name        || "Unknown";
        const studentEmail     = certReq.email;        // always present on the request
        const courseName       = certReq.certificateType;
        const yearOfCompletion = student?.yearOfCompletion || new Date().getFullYear();
        const grade            = student?.grade        || undefined;
        const cgpa             = student?.cgpa         || undefined;

        // 1. Upload PDF to IPFS
        const certId   = uuidv4();
        const fileName = `cert-${certId}.pdf`;
        let ipfsHash, ipfsUrl;

        try {
          ({ ipfsHash, ipfsUrl } = await uploadFileToPinata(req.file.buffer, fileName, certId));
        } catch (pinataErr) {
          return res.status(502).json({
            success: false,
            message: `IPFS upload failed: ${pinataErr.message}`,
          });
        }

        // 2. Issue on blockchain
        let txHash, blockNumber, issuerAddress, blockchainMock;
        try {
          ({ txHash, blockNumber, issuerAddress, mock: blockchainMock } =
            await writeToBlockchain(
              certId,
              ipfsHash,
              student ? student._id.toString() : studentEmail,
              courseName,
              yearOfCompletion
            ));
        } catch (chainErr) {
          const msg = chainErr.reason || chainErr.message || "Blockchain error";
          return res.status(500).json({ success: false, message: `Blockchain error: ${msg}` });
        }

        // 3. Persist Certificate document
        const certificate = await Certificate.create({
          certId,
          ipfsHash,
          ipfsUrl:          ipfsUrl || `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
          studentId:        student?._id,
          studentName,
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

        // 4. Create claim token (magic link for student)
        const claimToken = await ClaimToken.create({
          certId,
          studentEmail: studentEmail.toLowerCase(),
          studentName,
        });

        // 5. Update the certificate request record
        certReq.status           = "approved";
        certReq.txHash           = txHash;
        certReq.blockNumber      = blockNumber;
        certReq.ipfsHash         = ipfsHash;
        certReq.blockchainCertId = certId;
        await certReq.save();

        // 6. Send email — non-blocking
        sendCertificateIssued({
          to:               studentEmail,
          studentName,
          courseName,
          yearOfCompletion: parseInt(yearOfCompletion),
          grade,
          certId,
          ipfsUrl:          certificate.ipfsUrl,
          claimToken:       claimToken.token,
          pdfBuffer:        req.file.buffer,   // attach PDF to email
        }).catch(err => console.error("[Email] sendCertificateIssued:", err.message));

        // 7. Audit log
        await log({
          action: "REQUEST_APPROVED",
          performedBy: req.user._id,
          performedByRole: "issuer",
          targetCertId: certId,
          targetUserId: student?._id,
          details: {
            requestId: certReq.requestId,
            certificateType: certReq.certificateType,
            txHash,
            blockNumber,
            ipfsHash,
            blockchainMock,
          },
          req,
        });

        return res.json({
          success: true,
          message: blockchainMock
            ? "Request approved. Certificate uploaded to IPFS, saved (blockchain skipped — BLOCKCHAIN_OPTIONAL mode), and email sent."
            : "Request approved. Certificate issued on blockchain, uploaded to IPFS, and email sent to student.",
          request:        certReq,
          certificate,
          txHash,
          blockchainMock,
        });
      }

      // ── ALL OTHER STATUSES (processing / rejected / dispatched) ───────────
      certReq.status = status;
      if (status === "rejected" && rejectionReason) {
        certReq.rejectionReason = rejectionReason;
      }
      await certReq.save();

      await log({
        action: `REQUEST_${status.toUpperCase()}`,
        performedBy: req.user._id,
        performedByRole: "issuer",
        details: {
          requestId: certReq.requestId,
          certificateType: certReq.certificateType,
          status,
          rejectionReason,
        },
        req,
      });

      return res.json({ success: true, message: `Request ${status}.`, request: certReq });

    } catch (error) {
      if (error.reason) {
        return res.status(400).json({ success: false, message: `Blockchain error: ${error.reason}` });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

module.exports = router;