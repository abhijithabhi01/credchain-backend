/**
 * seedStudents.js
 * ---------------
 * Seeds 60 students into MongoDB.
 * Logic:
 *   - Every 3rd student (index % 3 === 2): hasBacklogs = true  → not eligible
 *   - Every 7th student (index % 7 === 6): resultsPublished = false → not eligible
 *   - Others: fully eligible
 *   - degreeEligible is auto-derived: true only when no backlogs AND results published
 *
 * Run: node src/utils/seedStudents.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Student   = require("../models/Student");

const COURSES = ["B.Tech CSE", "B.Tech ECE", "B.Tech ME", "MCA", "M.Tech CSE", "BCA"];

const FIRST_NAMES = [
  "Aarav", "Aditya", "Akash", "Ananya", "Anjali", "Arjun", "Aryan", "Deepa",
  "Divya", "Gayatri", "Gopal", "Harini", "Harish", "Ishaan", "Janani", "Karthik",
  "Kavya", "Keerthana", "Krishnan", "Lakshmi", "Manoj", "Meera", "Nandini",
  "Naveen", "Nikhil", "Parvathi", "Pooja", "Pradeep", "Prasanna", "Priya",
  "Rahul", "Ramesh", "Ranjith", "Rekha", "Rohith", "Sagar", "Sandeep", "Sanjay",
  "Saranya", "Sarath", "Shilpa", "Shiv", "Shreya", "Siddharth", "Sneha",
  "Sreehari", "Suresh", "Swathy", "Thejus", "Usha", "Varsha", "Vasanth",
  "Vidya", "Vijay", "Vikram", "Vineeth", "Vishal", "Yamini", "Zara", "Zeeshan",
];

const LAST_NAMES = [
  "Kumar", "Menon", "Nair", "Pillai", "Rajan", "Sharma", "Singh", "Varma",
  "Das", "Patel", "Reddy", "Krishnan", "Iyer", "Gopal", "Suresh",
];

// Generate a random DOB between 1999 and 2003
const randomDob = () => {
  const year  = 1999 + Math.floor(Math.random() * 5);  // 1999–2003
  const month = String(1  + Math.floor(Math.random() * 12)).padStart(2, "0");
  const day   = String(1  + Math.floor(Math.random() * 28)).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const randomPhone = () =>
  "9" + String(Math.floor(Math.random() * 900_000_000) + 100_000_000);

const buildStudents = () => {
  const students = [];

  for (let i = 0; i < 60; i++) {
    const firstName  = FIRST_NAMES[i];
    const lastName   = LAST_NAMES[i % LAST_NAMES.length];
    const name       = `${firstName} ${lastName}`;
    const regNum     = `KTU${String(2021001 + i).padStart(7, "0")}`;
    const course     = COURSES[i % COURSES.length];
    const email      = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@student.ktu.edu.in`;
    const mobile     = randomPhone();
    const dob        = randomDob();

    // Eligibility rules
    const hasBacklogs      = (i % 3 === 2);          // every 3rd student
    const resultsPublished = !(i % 7 === 6);          // every 7th student unpublished
    const degreeEligible   = !hasBacklogs && resultsPublished;

    students.push({
      registerNumber:   regNum,
      name,
      dob,
      mobile,
      email,
      hasBacklogs,
      resultsPublished,
      degreeEligible,
      course,
      yearOfCompletion: 2024,
    });
  }

  return students;
};

const seed = async () => {
  try {
    await connectDB();
    console.log("🌱 Connected to DB — seeding students...");

    await Student.deleteMany({});
    console.log("🗑️  Cleared existing students.");

    const students = buildStudents();
    await Student.insertMany(students);

    const total    = students.length;
    const eligible = students.filter((s) => s.degreeEligible).length;
    const backlogs = students.filter((s) => s.hasBacklogs).length;
    const unpub    = students.filter((s) => !s.resultsPublished).length;

    console.log(`✅ Seeded ${total} students`);
    console.log(`   • Eligible  : ${eligible}`);
    console.log(`   • Backlogs  : ${backlogs}`);
    console.log(`   • Unpublished results: ${unpub}`);
    console.log("\n📋 Sample register numbers (for testing):");
    console.log("   Eligible  :", students.find((s)  =>  s.degreeEligible)?.registerNumber);
    console.log("   Backlogs  :", students.find((s)  =>  s.hasBacklogs)?.registerNumber);
    console.log("   Unpublished:", students.find((s) => !s.resultsPublished)?.registerNumber);

    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  }
};

seed();
