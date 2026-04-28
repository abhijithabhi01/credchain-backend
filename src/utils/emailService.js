const nodemailer = require("nodemailer");

// ── Frontend URL ──────────────────────────────────────────────
const BASE_URL   = "https://credchain-frontend-khaki.vercel.app";

const FROM_NAME  = "CredChain";
const FROM_EMAIL = process.env.GMAIL_USER || "";

// ── Transporter ───────────────────────────────────────────────
// Render.com blocks port 587 (STARTTLS) on free plans.
// Using explicit host + port 465 (SSL) bypasses the block.
// If 465 also fails on your Render plan, swap to SendGrid/Resend
// and replace this transporter with their nodemailer transport.
let _transporter = null;

const getTransporter = () => {
  if (_transporter) return _transporter;

  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    console.error(
      "\n❌ [Email] Gmail credentials not set.\n" +
      "   Add to Render environment variables:\n" +
      "     GMAIL_USER=yourcredchain@gmail.com\n" +
      "     GMAIL_PASS=xxxx xxxx xxxx xxxx  (Gmail App Password)\n" +
      "   How to get App Password:\n" +
      "     1. Enable 2FA on Gmail\n" +
      "     2. https://myaccount.google.com/apppasswords\n" +
      "     3. Create password for 'Mail'\n"
    );
    return null;
  }

  // Use explicit host/port instead of service:'gmail'
  // port 465 + secure:true = SSL (works on Render free tier)
  _transporter = nodemailer.createTransport({
    host:   "smtp.gmail.com",
    port:   465,
    secure: true,            // SSL on port 465 — NOT STARTTLS
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
    // Timeouts — avoids hanging on Render's restricted network
    connectionTimeout: 10000,
    greetingTimeout:   10000,
    socketTimeout:     15000,
    pool: false,             // one connection per send — more reliable on Render
  });

  console.log(`✅ [Email] Nodemailer ready (smtp.gmail.com:465) | FROM: ${process.env.GMAIL_USER}`);
  return _transporter;
};

// ── Core send wrapper ─────────────────────────────────────────
const send = async ({ to, subject, html, attachments }) => {
  if (!to) {
    console.warn(`[Email] SKIPPED "${subject}" — no recipient address`);
    return null;
  }

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(`[Email] SKIPPED "${subject}" → ${to}  (Gmail not configured)`);
    return null;
  }

  try {
    const mailOptions = {
      from:    `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to,
      subject,
      html,
    };

    if (attachments?.length) {
      mailOptions.attachments = attachments.map(a => ({
        filename: a.filename,
        content:  Buffer.from(a.content, "base64"),
      }));
    }

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] ✅ SENT "${subject}" → ${to}  (messageId: ${info.messageId})`);
    return info;
  } catch (err) {
    console.error(`[Email] ❌ FAILED "${subject}" → ${to}:`, err.message);

    if (err.message?.includes("ECONNREFUSED") || err.message?.includes("timeout") || err.message?.includes("ETIMEDOUT")) {
      console.error(
        "   Network issue on Render — SMTP port may be blocked.\n" +
        "   Alternatives:\n" +
        "     • Upgrade Render plan (paid plans allow outbound SMTP)\n" +
        "     • Switch to SendGrid: npm i @sendgrid/mail (free 100/day)\n" +
        "     • Switch to Resend: npm i resend (free 3000/month)\n" +
        "   Both have nodemailer-compatible transports.\n"
      );
    }

    if (err.message?.includes("Invalid login") || err.message?.includes("Username and Password")) {
      console.error(
        "   Fix: Use a Gmail App Password (not your regular password).\n" +
        "   Generate at https://myaccount.google.com/apppasswords\n"
      );
    }

    // Reset cached transporter so next attempt re-initialises cleanly
    _transporter = null;

    return null; // never throw — email is non-fatal
  }
};

// ── Shared CSS ────────────────────────────────────────────────
const CSS = `
  body{margin:0;padding:0;background:#000;font-family:'Segoe UI',system-ui,sans-serif;color:#fff;}
  a{color:#a855f7;text-decoration:none;}
  .wrap{max-width:600px;margin:0 auto;background:#0f0f0f;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;}
  .hdr{background:linear-gradient(90deg,#a855f7,#38bdf8);padding:28px 36px;}
  .hdr h1{margin:0;font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.02em;}
  .hdr p{margin:5px 0 0;font-size:13px;color:rgba(255,255,255,0.7);}
  .body{padding:32px 36px;}
  .card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:22px 26px;margin:20px 0;}
  dt{font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.3);margin-bottom:3px;}
  dd{font-size:15px;font-weight:600;color:#fff;margin:0 0 16px;}
  dd:last-child{margin-bottom:0;}
  .btn{display:inline-block;padding:13px 32px;border-radius:50px;font-size:14px;font-weight:700;
       color:#fff !important;background:linear-gradient(90deg,#a855f7,#38bdf8);text-decoration:none !important;}
  .btn-ghost{display:inline-block;padding:13px 32px;border-radius:50px;font-size:14px;font-weight:600;
             color:#fff !important;border:1px solid rgba(255,255,255,0.2);text-decoration:none !important;}
  .badge{display:inline-block;padding:3px 12px;border-radius:50px;font-size:11px;font-weight:600;}
  .badge-green{background:rgba(74,222,128,0.12);color:#4ade80;border:1px solid rgba(74,222,128,0.2);}
  .badge-red{background:rgba(248,113,113,0.12);color:#f87171;border:1px solid rgba(248,113,113,0.2);}
  .hash{font-family:monospace;font-size:12px;color:rgba(255,255,255,0.45);word-break:break-all;}
  .footer{padding:20px 36px;border-top:1px solid rgba(255,255,255,0.05);font-size:12px;color:rgba(255,255,255,0.2);}
  hr{border:none;border-top:1px solid rgba(255,255,255,0.06);margin:24px 0;}
  .cta{text-align:center;margin:24px 0;}
  .fallback-url{font-size:11px;color:rgba(255,255,255,0.22);word-break:break-all;text-align:center;margin-top:10px;}
`;

// ── Template: Certificate Issued ──────────────────────────────
const tplIssued = ({
  studentName, courseName, yearOfCompletion, grade,
  certId, ipfsUrl, verifyUrl, claimUrl,
}) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Your Certificate is Ready — CredChain</title>
  <style>${CSS}</style>
</head>
<body>
<div class="wrap">

  <div class="hdr">
    <h1>&#x2B21; CredChain — Your Certificate is Ready</h1>
    <p>Blockchain-verified academic credential from your institution</p>
  </div>

  <div class="body">
    <p style="font-size:16px;margin-top:0">Hi <strong>${studentName}</strong>,</p>
    <p style="color:rgba(255,255,255,0.6);font-size:14px;line-height:1.75">
      Congratulations! Your certificate has been issued and permanently recorded on the
      <strong>Ethereum Sepolia blockchain</strong> by your institution.
      Its authenticity can be verified by anyone at any time.
    </p>

    <div class="card">
      <dl>
        <dt>Certificate ID</dt>
        <dd><span class="hash">${certId}</span></dd>
        <dt>Programme</dt>
        <dd>${courseName}</dd>
        <dt>Year of Completion</dt>
        <dd>${yearOfCompletion}</dd>
        ${grade ? `<dt>Grade</dt><dd>${grade}</dd>` : ""}
        <dt>Status</dt>
        <dd><span class="badge badge-green">&#x2713; Verified on Blockchain</span></dd>
      </dl>
    </div>

    ${claimUrl ? `
    <div class="card" style="border-color:rgba(168,85,247,0.25);background:rgba(168,85,247,0.05);text-align:center;">
      <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#fff;">Claim your certificate</p>
      <p style="margin:0 0 18px;font-size:13px;color:rgba(255,255,255,0.45);line-height:1.6">
        Creates your CredChain account automatically.<br>No password needed — one click.
      </p>
      <a href=${BASE_URL} class="btn" style="font-size:15px;padding:14px 40px;">
        Claim Certificate &rarr;
      </a>
      <p class="fallback-url">
        Button not working? Paste this URL in your browser:<br>
        <a href="${BASE_URL} style="color:rgba(168,85,247,0.8)">${claimUrl}</a>
      </p>
      <p style="font-size:11px;color:rgba(255,255,255,0.18);margin:14px 0 0;">
        Link expires in 24 hours &bull; single use only
      </p>
    </div>
    ` : ""}

    <div class="cta">
      <a href="${verifyUrl}" class="btn-ghost">&#x1F50D; Verify Certificate Publicly</a>
    </div>
    <p class="fallback-url">
      Verify URL: <a href="${verifyUrl}" style="color:rgba(255,255,255,0.35)">${verifyUrl}</a>
    </p>

    ${ipfsUrl ? `
    <hr>
    <p style="font-size:12px;color:rgba(255,255,255,0.2);text-align:center;">
      Permanently stored on IPFS:<br>
      <a href="${ipfsUrl}" style="font-family:monospace;font-size:11px;color:rgba(255,255,255,0.3)">${ipfsUrl}</a>
    </p>
    ` : ""}
  </div>

  <div class="footer">
    CredChain &bull; Blockchain Certificate Registry &bull;
    This email was sent because a certificate was issued in your name by your institution.
    If you did not expect this, please contact your institution.
  </div>
</div>
</body>
</html>`;

// ── Template: Standalone Claim Link ──────────────────────────
const tplClaim = ({ studentName, certId, courseName, claimUrl }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Claim Your Certificate — CredChain</title>
  <style>${CSS}</style>
</head>
<body>
<div class="wrap">

  <div class="hdr">
    <h1>&#x2B21; CredChain — Claim Your Certificate</h1>
    <p>One-click access — no password required</p>
  </div>

  <div class="body">
    <p style="font-size:16px;margin-top:0">Hi <strong>${studentName}</strong>,</p>
    <p style="color:rgba(255,255,255,0.6);font-size:14px;line-height:1.75">
      A new claim link has been generated for your <strong>${courseName}</strong>
      certificate. Click below to claim it and access your CredChain dashboard.
    </p>

    <div class="card" style="border-color:rgba(168,85,247,0.2);background:rgba(168,85,247,0.04)">
      <dl>
        <dt>Certificate ID</dt>
        <dd><span class="hash">${certId}</span></dd>
        <dt>Programme</dt>
        <dd>${courseName}</dd>
      </dl>
    </div>

    <div class="cta">
      <a href="${claimUrl}" class="btn" style="font-size:15px;padding:14px 40px;">
        Claim Certificate &rarr;
      </a>
    </div>
    <p class="fallback-url">
      Button not working? Paste this in your browser:<br>
      <a href="${claimUrl}" style="color:rgba(168,85,247,0.8)">${claimUrl}</a>
    </p>
    <p style="font-size:12px;color:rgba(255,255,255,0.18);text-align:center;margin-top:16px;">
      Expires in 24 hours &bull; single use &bull; do not share
    </p>
  </div>

  <div class="footer">CredChain &bull; Magic Link Authentication</div>
</div>
</body>
</html>`;

// ── Template: Revocation Notice ───────────────────────────────
const tplRevoked = ({ studentName, courseName, certId, reason }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Certificate Revoked — CredChain</title>
  <style>${CSS}</style>
</head>
<body>
<div class="wrap">

  <div class="hdr" style="background:linear-gradient(90deg,#7f1d1d,#991b1b)">
    <h1>&#x2B21; CredChain — Certificate Revoked</h1>
    <p>Important notice regarding your credential</p>
  </div>

  <div class="body">
    <p style="font-size:16px;margin-top:0">Hi <strong>${studentName}</strong>,</p>
    <p style="color:rgba(255,255,255,0.6);font-size:14px;line-height:1.75">
      We regret to inform you that the following certificate has been revoked
      by your institution and is <strong>no longer valid</strong>.
      This revocation is recorded on the blockchain and visible to anyone who verifies it.
    </p>

    <div class="card" style="border-color:rgba(248,113,113,0.2);background:rgba(248,113,113,0.04)">
      <dl>
        <dt>Certificate ID</dt>
        <dd><span class="hash">${certId}</span></dd>
        <dt>Programme</dt>
        <dd>${courseName}</dd>
        ${reason ? `<dt>Reason</dt><dd>${reason}</dd>` : ""}
        <dt>Status</dt>
        <dd><span class="badge badge-red">&#x2717; Revoked</span></dd>
      </dl>
    </div>

    <p style="font-size:13px;color:rgba(255,255,255,0.35);line-height:1.7">
      If you believe this is an error, contact your institution directly.
      Do not present this certificate for any official purpose.
    </p>
  </div>

  <div class="footer">CredChain &bull; Blockchain Certificate Registry</div>
</div>
</body>
</html>`;

// ── Public API ────────────────────────────────────────────────

const sendCertificateIssued = async ({
  to, studentName, courseName, yearOfCompletion, grade,
  certId, ipfsUrl, claimToken, pdfBuffer,
}) => {
  const verifyUrl = `${BASE_URL}/verify?certId=${certId}`;

  // ✅ FIXED: was /certificate/claim?token= — route doesn't exist in App.jsx
  //    Correct React Router path is /claim?token=
  const claimUrl  = claimToken ? `${BASE_URL}/claim?token=${claimToken}` : null;

  const attachments = pdfBuffer
    ? [{ filename: `CredChain-${certId}.pdf`, content: pdfBuffer.toString("base64") }]
    : [];

  return send({
    to,
    subject: `Your Certificate is Ready — ${courseName}`,
    html: tplIssued({
      studentName, courseName, yearOfCompletion, grade,
      certId, ipfsUrl, verifyUrl, claimUrl,
    }),
    attachments,
  });
};

const sendClaimLink = async ({ to, studentName, certId, courseName, claimToken }) => {
  // ✅ FIXED: same path correction
  const claimUrl = `${BASE_URL}/claim?token=${claimToken}`;
  return send({
    to,
    subject: `Claim your CredChain certificate — ${courseName}`,
    html: tplClaim({ studentName, certId, courseName, claimUrl }),
  });
};

const sendRevocationNotice = async ({ to, studentName, courseName, certId, reason }) => {
  return send({
    to,
    subject: `Certificate Revoked — ${courseName}`,
    html: tplRevoked({ studentName, courseName, certId, reason }),
  });
};

module.exports = { sendCertificateIssued, sendClaimLink, sendRevocationNotice };