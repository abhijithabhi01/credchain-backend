const mongoose = require("mongoose");

// ── Subject sub-schema ────────────────────────────────────────────────────────
const subjectSchema = new mongoose.Schema(
  {
    code:       { type: String, required: true, trim: true },
    name:       { type: String, required: true, trim: true },
    credits:    { type: Number, required: true },
    grade:      { type: String, required: true, trim: true },   // O / A+ / A / B+ / B / C / P / F
    gradePoint: { type: Number, required: true },               // 10 / 9 / 8 / 7 / 6 / 5 / 4 / 0
    semester:   { type: Number, required: true },
    cleared:    { type: Boolean, default: true },
  },
  { _id: false }
);

// ── Document sub-schema ───────────────────────────────────────────────────────
// Stores base64 data-URI strings so no separate file-store is needed for the seed.
// In production you'd swap these for Pinata/IPFS hashes.
const documentSchema = new mongoose.Schema(
  {
    type:        { type: String, required: true },   // "aadhar" | "hallticket" | "photo"
    label:       { type: String, required: true },   // human-readable label
    dataUri:     { type: String, required: true },   // base64 PNG/PDF (seed uses tiny SVG→base64)
    mimeType:    { type: String, default: "image/png" },
    uploadedAt:  { type: Date, default: Date.now },
    verified:    { type: Boolean, default: false },
  },
  { _id: false }
);

// ── Main Student schema ───────────────────────────────────────────────────────
const studentSchema = new mongoose.Schema(
  {
    registerNumber: {
      type:      String,
      required:  [true, "Register number is required"],
      unique:    true,
      trim:      true,
      uppercase: true,
    },
    name: {
      type:     String,
      required: [true, "Name is required"],
      trim:     true,
    },
    dob: {
      // Stored as "YYYY-MM-DD" string for easy comparison during login
      type:     String,
      required: [true, "Date of birth is required"],
    },
    mobile: { type: String, trim: true },
    email:  { type: String, lowercase: true, trim: true },

    // ── Academic status ──────────────────────────────────────
    hasBacklogs:      { type: Boolean, default: false },
    resultsPublished: { type: Boolean, default: true },
    degreeEligible:   { type: Boolean, default: true },

    // ── Course info ──────────────────────────────────────────
    course:           { type: String, default: "B.Tech", trim: true },
    yearOfCompletion: { type: Number },
    cgpa:             { type: Number },   // calculated from subjects
    totalCredits:     { type: Number },

    // ── Subjects ─────────────────────────────────────────────
    // Full semester-wise subject list with grades
    subjects: [subjectSchema],

    // ── Uploaded documents ────────────────────────────────────
    // Three required docs: Aadhar card, recent hall ticket, passport photo
    documents: [documentSchema],
  },
  { timestamps: true }
);

studentSchema.index({ registerNumber: 1 });
studentSchema.index({ email: 1 });

// Virtual: allSubjectsCleared
studentSchema.virtual("allSubjectsCleared").get(function () {
  if (!this.subjects || this.subjects.length === 0) return false;
  return this.subjects.every((s) => s.cleared);
});

// Virtual: hasAllDocuments
studentSchema.virtual("hasAllDocuments").get(function () {
  if (!this.documents || this.documents.length === 0) return false;
  const types = this.documents.map((d) => d.type);
  return ["aadhar", "hallticket", "photo"].every((t) => types.includes(t));
});

studentSchema.set("toJSON", { virtuals: true });
studentSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Student", studentSchema);