const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: [true, "Name is required"],
      trim:     true
    },
    email: {
      type:      String,
      required:  [true, "Email is required"],
      unique:    true,
      lowercase: true,
      trim:      true
    },
    password: {
      type:      String,
      required:  [true, "Password is required"],
      minlength: 6,
      select:    false   // never returned in queries by default
    },
    role: {
      type:    String,
      enum:    ["student", "employer", "issuer", "admin"],
      default: "student"
    },

    // ── Student fields ──────────────────────────────────────
    studentId: {
      type:   String,
      trim:   true,
      sparse: true   // unique only when set
    },
    university: {
      type: String
      // No default — only populated for students and issuers, not employers/admins
    },
    course: {
      type: String,
      trim: true
    },

    // ── Employer fields ─────────────────────────────────────
    company: {
      type: String,
      trim: true
    },
    designation: {
      type: String,
      trim: true
    },

    // ── Certificates linked to student account ──────────────
    linkedCertificates: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref:  "Certificate"
      }
    ],

    isActive: {
      type:    Boolean,
      default: true
    }
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare plaintext with hashed password
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Strip password from JSON output
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model("User", userSchema);