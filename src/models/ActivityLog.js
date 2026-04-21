const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    action: {
      type:     String,
      required: true,
      enum: [
        "USER_REGISTERED",
        "USER_LOGIN",
        "CERTIFICATE_UPLOADED",   // PDF uploaded to IPFS
        "CERTIFICATE_ISSUED",     // Written to blockchain
        "CERTIFICATE_REVOKED",
        "CERTIFICATE_LINKED",     // Student linked cert to account
        "CERTIFICATE_VERIFIED",   // Someone verified a cert
        "ISSUER_ADDED",
        "ISSUER_REMOVED",
        "PROFILE_UPDATED"
      ]
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "User"
    },
    performedByRole: {
      type: String
    },
    targetCertId: {
      type: String
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "User"
    },
    details: {
      type: mongoose.Schema.Types.Mixed
    },
    ipAddress: {
      type: String
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ActivityLog", activityLogSchema);
