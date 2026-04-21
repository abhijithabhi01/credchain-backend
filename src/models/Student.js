const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    registerNumber: {
      type:     String,
      required: [true, "Register number is required"],
      unique:   true,
      trim:     true,
      uppercase: true,
    },
    name: {
      type:     String,
      required: [true, "Name is required"],
      trim:     true,
    },
    dob: {
      // Store as "YYYY-MM-DD" string for easy comparison during login
      type:     String,
      required: [true, "Date of birth is required"],
    },
    mobile: {
      type:  String,
      trim:  true,
    },
    email: {
      type:      String,
      lowercase: true,
      trim:      true,
    },

    // ── Academic status ──────────────────────────────────────
    hasBacklogs: {
      type:    Boolean,
      default: false,
    },
    resultsPublished: {
      type:    Boolean,
      default: true,
    },
    degreeEligible: {
      type:    Boolean,
      default: true,
    },

    // ── Course info ──────────────────────────────────────────
    course: {
      type:    String,
      default: "B.Tech",
      trim:    true,
    },
    yearOfCompletion: {
      type: Number,
    },
  },
  { timestamps: true }
);

studentSchema.index({ registerNumber: 1 });
studentSchema.index({ email: 1 });

module.exports = mongoose.model("Student", studentSchema);
