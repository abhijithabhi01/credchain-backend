const mongoose = require("mongoose");
const crypto   = require("crypto");

const claimTokenSchema = new mongoose.Schema(
  {
    token: {
      type:     String,
      required: true,
      unique:   true,
      default:  () => crypto.randomBytes(32).toString("hex"),
    },
    certId: {
      type:     String,
      required: true,
    },
    studentEmail: {
      type:      String,
      required:  true,
      lowercase: true,
    },
    studentName: {
      type: String,
    },
    used: {
      type:    Boolean,
      default: false,
    },
    usedAt: {
      type: Date,
    },
    expiresAt: {
      type:    Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

// TTL — MongoDB auto-deletes expired+used tokens after 2 days
claimTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 172800 });
claimTokenSchema.index({ token: 1 });
claimTokenSchema.index({ certId: 1 });

module.exports = mongoose.model("ClaimToken", claimTokenSchema);
