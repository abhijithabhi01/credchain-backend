const ActivityLog = require("../models/ActivityLog");

/**
 * Write an entry to the activity log.
 * Non-fatal — errors are caught and logged to console only.
 *
 * @param {object} opts
 * @param {string}   opts.action           - One of the ActivityLog action enums
 * @param {ObjectId} opts.performedBy      - User._id who performed the action
 * @param {string}   opts.performedByRole  - role string
 * @param {string}   opts.targetCertId     - certId if cert-related
 * @param {ObjectId} opts.targetUserId     - User._id if user-related
 * @param {object}   opts.details          - Any extra data (txHash, etc.)
 * @param {object}   opts.req              - Express request (for IP)
 */
const log = async ({ action, performedBy, performedByRole, targetCertId, targetUserId, details, req }) => {
  try {
    await ActivityLog.create({
      action,
      performedBy,
      performedByRole,
      targetCertId,
      targetUserId,
      details,
      ipAddress: req?.headers?.["x-forwarded-for"] || req?.ip
    });
  } catch (err) {
    console.error("[ActivityLog] Failed to write log:", err.message);
  }
};

module.exports = { log };
