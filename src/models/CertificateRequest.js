const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const CERTIFICATE_TYPES = [
  "MCA Degree Certificate"
];

const certificateRequestSchema = new mongoose.Schema(
  {
    requestId: {
      type:    String,
      unique:  true,
      default: () => `REQ-${uuidv4().toUpperCase().slice(0, 8)}`,
    },

    // ── Student reference ────────────────────────────────────
    student: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Student",
      required: true,
    },
    registerNumber: {
      type:     String,
      required: true,
    },

    // ── Request details ──────────────────────────────────────
    mobile: {
      type:     String,
      required: [true, "Mobile is required"],
      trim:     true,
    },
    email: {
      type:      String,
      required:  [true, "Email is required"],
      lowercase: true,
      trim:      true,
    },
    address: {
      type:     String,
      required: [true, "Address is required"],
      trim:     true,
    },
    pincode: {
      type:     String,
      required: [true, "Pincode is required"],
      trim:     true,
    },
    certificateType: {
      type:     String,
      required: [true, "Certificate type is required"],
      enum:     CERTIFICATE_TYPES,
    },

    // ── Processing status ────────────────────────────────────
    status: {
      type:    String,
      enum:    ["pending", "processing", "approved", "rejected", "dispatched"],
      default: "pending",
    },
    rejectionReason: {
      type: String,
    },

    // ── Blockchain (filled after degree cert approval) ───────
    txHash: {
      type: String,
    },
    blockNumber: {
      type: Number,
    },
    ipfsHash: {
      type: String,
    },
    blockchainCertId: {
      type: String,
    },
  },
  { timestamps: true }
);

certificateRequestSchema.index({ requestId: 1 });
certificateRequestSchema.index({ student: 1 });
certificateRequestSchema.index({ registerNumber: 1 });
certificateRequestSchema.index({ status: 1 });

module.exports = mongoose.model("CertificateRequest", certificateRequestSchema);
