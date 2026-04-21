const express    = require("express");
const cors       = require("cors");
const helmet     = require("helmet");
const morgan     = require("morgan");
const rateLimit  = require("express-rate-limit");

const connectDB  = require("./config/db");

const authRoutes   = require("./routes/auth");
const adminRoutes  = require("./routes/admin");
const issuerRoutes = require("./routes/issuer");
const publicRoutes = require("./routes/public");
const claimRoutes   = require("./routes/claim");
const studentRoutes = require("./routes/student");

connectDB();

const app = express();

app.use(helmet());

const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || "")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean)
  .concat(["http://localhost:3000", "http://localhost:5173","https://credchain-frontend-khaki.vercel.app","https://credchain-frontend-git-main-abhijith-ss-projects.vercel.app"]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed.`));
  },
  credentials: true,
  methods:     ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.options("*", cors());

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  message:  { success: false, message: "Too many requests. Try again later." },
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

app.get("/health", (req, res) => {
  res.json({
    success:   true,
    message:   "CredChain API is running",
    timestamp: new Date().toISOString(),
    version:   "2.0.0",
  });
});

app.use("/api/auth",   authRoutes);
app.use("/api/admin",  adminRoutes);
app.use("/api/issuer", issuerRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/claim",   claimRoutes);   // ← magic-link claim flow
app.use("/api/student", studentRoutes); // ← student certificate request flow

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[Error]", err.message);
  if (err.message?.startsWith("CORS:")) return res.status(403).json({ success: false, message: err.message });
  if (err.code === "LIMIT_FILE_SIZE")   return res.status(400).json({ success: false, message: "File too large. Max 10 MB." });
  if (err.message === "Only PDF files are accepted.") return res.status(400).json({ success: false, message: err.message });
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === "production" ? "Internal server error." : err.message,
  });
});

module.exports = app;
