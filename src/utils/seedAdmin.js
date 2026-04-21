/**
 * Seed Script
 * Creates the predefined Admin and KTU Issuer accounts in MongoDB.
 * Run once after setting up .env:
 *   node src/utils/seedAdmin.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const mongoose = require("mongoose");
const User     = require("../models/User");

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI, { dbName: "credchain" });
  console.log("Connected to MongoDB...\n");

  const users = [
    {
      name:     "CredChain Admin",
      email:    process.env.ADMIN_EMAIL    || "admin@credchain.gov.in",
      password: process.env.ADMIN_PASSWORD || "Admin@1234",
      role:     "admin"
    },
    {
      name:       "Kerala Technological University",
      email:      process.env.ISSUER_EMAIL    || "ktu@credchain.in",
      password:   process.env.ISSUER_PASSWORD || "KTU@1234",
      role:       "issuer",
      university: "KTU"
    }
  ];

  for (const data of users) {
    const exists = await User.findOne({ email: data.email });
    if (exists) {
      console.log(`⚠️  Already exists [${data.role}]: ${data.email}`);
    } else {
      await User.create(data);
      console.log(`✅ Created [${data.role}]: ${data.email}`);
    }
  }

  console.log("\n🎉 Seeding complete!");
  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
