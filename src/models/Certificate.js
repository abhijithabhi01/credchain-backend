const mongoose = require("mongoose");

const certificateSchema = new mongoose.Schema(
  {
    // Unique ID — also used as the key on the blockchain
    certId: {
      type:     String,
      required: true,
      unique:   true,
      trim:     true
    },

    // ── Student info ────────────────────────────────────────
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "User"
    },
    studentName: {
      type:     String,
      required: true
    },
    studentEmail: {
      type:     String,
      required: true,
      lowercase: true
    },

    // ── Academic info ───────────────────────────────────────
    courseName: {
      type:     String,
      required: true,
      trim:     true
    },
    university: {
      type:    String,
      default: "Kerala Technological University (KTU)"
    },
    yearOfCompletion: {
      type:     Number,
      required: true
    },
    grade: {
      type: String   // e.g. "First Class with Distinction"
    },
    cgpa: {
      type: Number
    },

    // ── IPFS info ───────────────────────────────────────────
    ipfsHash: {
      type:     String,
      required: true
    },
    ipfsUrl: {
      type: String
    },

    // ── Blockchain info ─────────────────────────────────────
    txHash: {
      type: String   // Ethereum transaction hash
    },
    blockNumber: {
      type: Number
    },
    issuedByAddress: {
      type: String   // Ethereum wallet address of issuer
    },

    // ── Status ──────────────────────────────────────────────
    status: {
      type:    String,
      enum:    ["pending", "issued", "revoked"],
      default: "pending"
    },
    revokedAt: {
      type: Date
    },
    revokeReason: {
      type: String
    },

    // ── Issuer reference ────────────────────────────────────
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "User"
    }
  },
  { timestamps: true }
);

certificateSchema.index({ certId: 1 });
certificateSchema.index({ studentId: 1 });
certificateSchema.index({ studentEmail: 1 });
certificateSchema.index({ status: 1 });

module.exports = mongoose.model("Certificate", certificateSchema);
