/**
 * seedStudents.js  (v2)
 * ─────────────────────
 * Seeds exactly 60 students with:
 *   • Realistic Indian names, register numbers, DOBs
 *   • Full semester-wise subjects with grades
 *   • Calculated CGPA
 *   • Three mock documents: Aadhar card, Hall Ticket, Passport Photo
 *     (stored as tiny base64-encoded SVG placeholders)
 *   • Eligibility rules:
 *       - Every 3rd student (i % 3 === 2)  → hasBacklogs = true
 *       - Every 7th student (i % 7 === 6)  → resultsPublished = false
 *       - Others                           → fully eligible
 *
 * Run:  node src/utils/seedStudents.js
 */

require("dotenv").config();
const mongoose  = require("mongoose");
const connectDB = require("../config/db");
const Student   = require("../models/Student");

// ── Name pools ────────────────────────────────────────────────────────────────
const FIRST_NAMES = [
  "Aarav","Aditya","Akash","Ananya","Anjali","Arjun","Aryan","Deepa",
  "Divya","Gayatri","Gopal","Harini","Harish","Ishaan","Janani","Karthik",
  "Kavya","Keerthana","Krishnan","Lakshmi","Manoj","Meera","Nandini",
  "Naveen","Nikhil","Parvathi","Pooja","Pradeep","Prasanna","Priya",
  "Rahul","Ramesh","Ranjith","Rekha","Rohith","Sagar","Sandeep","Sanjay",
  "Saranya","Sarath","Shilpa","Shiv","Shreya","Siddharth","Sneha",
  "Sreehari","Suresh","Swathy","Thejus","Usha","Varsha","Vasanth",
  "Vidya","Vijay","Vikram","Vineeth","Vishal","Yamini","Zara","Zeeshan",
];

const LAST_NAMES = [
  "Kumar","Menon","Nair","Pillai","Rajan","Sharma","Singh","Varma",
  "Das","Patel","Reddy","Krishnan","Iyer","Gopal","Suresh",
];

// ── Course definitions ────────────────────────────────────────────────────────
const COURSE_DEFS = {
  "MCA": {
    prefix: "MC",
    semesters: 4,
    subjects: [
      { code:"MC101", name:"Discrete Mathematics",              credits:4, semester:1 },
      { code:"MC102", name:"C & Data Structures",               credits:4, semester:1 },
      { code:"MC103", name:"Computer Organization",             credits:3, semester:1 },
      { code:"MC104", name:"Probability & Statistics",          credits:3, semester:1 },
      { code:"MC201", name:"Object Oriented Programming (Java)",credits:4, semester:2 },
      { code:"MC202", name:"Database Management Systems",       credits:4, semester:2 },
      { code:"MC203", name:"Operating Systems",                 credits:4, semester:2 },
      { code:"MC204", name:"Computer Networks",                 credits:3, semester:2 },
      { code:"MC301", name:"Web Technologies",                  credits:4, semester:3 },
      { code:"MC302", name:"Software Engineering",              credits:3, semester:3 },
      { code:"MC303", name:"Design & Analysis of Algorithms",   credits:4, semester:3 },
      { code:"MC304", name:"Cloud Computing",                   credits:3, semester:3 },
      { code:"MC401", name:"Machine Learning",                  credits:4, semester:4 },
      { code:"MC402", name:"Information Security",              credits:3, semester:4 },
      { code:"MC403", name:"Project Work",                      credits:6, semester:4 },
    ],
  },
};


// ── Grade scale ───────────────────────────────────────────────────────────────
const GOOD_GRADES  = ["O","A+","A","A+","O","A","B+"];
const PASS_GRADES  = ["B+","B","C","P"];
const BACKLOG_MARK = "F";

const GRADE_POINTS = { "O":10, "A+":9, "A":8, "B+":7, "B":6, "C":5, "P":4, "F":0 };

function pickGrade(grades) {
  return grades[Math.floor(Math.random() * grades.length)];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const randomDob = () => {
  const year  = 1999 + Math.floor(Math.random() * 5);
  const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
  const day   = String(1 + Math.floor(Math.random() * 28)).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const randomPhone = () =>
  "9" + String(Math.floor(Math.random() * 900_000_000) + 100_000_000);

/** Calculate CGPA from subjects array */
function calcCgpa(subjects) {
  let totalWeighted = 0, totalCredits = 0;
  for (const s of subjects) {
    totalWeighted += s.gradePoint * s.credits;
    totalCredits  += s.credits;
  }
  return totalCredits > 0 ? Math.round((totalWeighted / totalCredits) * 100) / 100 : 0;
}

/**
 * Build subjects array for a student.
 * hasBacklogs → one random subject marked "F" (cleared:false).
 */
function buildSubjects(courseDef, hasBacklogs) {
  const subjects = courseDef.subjects.map((s, idx) => {
    const grade      = pickGrade(GOOD_GRADES);
    const gradePoint = GRADE_POINTS[grade];
    return { ...s, grade, gradePoint, cleared: true };
  });

  if (hasBacklogs) {
    // Mark one non-project subject as failed
    const failIdx = subjects.findIndex(
      (s) => !s.name.toLowerCase().includes("project") &&
             !s.name.toLowerCase().includes("training")
    );
    if (failIdx !== -1) {
      subjects[failIdx] = {
        ...subjects[failIdx],
        grade:      BACKLOG_MARK,
        gradePoint: 0,
        cleared:    false,
      };
    }
  }

  return subjects;
}

/**
 * Generate a tiny base64-encoded SVG that acts as a mock document image.
 * This keeps the seed self-contained with no external dependencies.
 */
function mockDocumentBase64(docType, studentName, registerNumber) {
  const labels = {
    aadhar:      "AADHAAR CARD",
    hallticket:  "HALL TICKET",
    photo:       "PASSPORT PHOTO",
  };
  const colors = {
    aadhar:     "#1a237e",
    hallticket: "#004d40",
    photo:      "#4a148c",
  };
  const label = labels[docType] || docType.toUpperCase();
  const color = colors[docType] || "#333";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">
  <rect width="320" height="200" rx="12" fill="${color}" opacity="0.9"/>
  <rect x="10" y="10" width="300" height="180" rx="8" fill="none" stroke="white" stroke-width="1.5" opacity="0.4"/>
  <text x="160" y="50" font-family="Arial" font-size="16" font-weight="bold" fill="white" text-anchor="middle">${label}</text>
  <line x1="30" y1="65" x2="290" y2="65" stroke="white" stroke-width="0.5" opacity="0.4"/>
  <text x="160" y="100" font-family="Arial" font-size="13" fill="white" text-anchor="middle" opacity="0.9">${studentName}</text>
  <text x="160" y="125" font-family="monospace" font-size="12" fill="white" text-anchor="middle" opacity="0.7">${registerNumber}</text>
  <text x="160" y="170" font-family="Arial" font-size="10" fill="white" text-anchor="middle" opacity="0.5">MOCK DOCUMENT — SEED DATA</text>
</svg>`;

  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

/** Build the three required documents for a student */
function buildDocuments(studentName, registerNumber) {
  return [
    {
      type:      "aadhar",
      label:     "Aadhar Card",
      dataUri:   mockDocumentBase64("aadhar", studentName, registerNumber),
      mimeType:  "image/svg+xml",
      verified:  true,
    },
    {
      type:      "hallticket",
      label:     "Recent Hall Ticket",
      dataUri:   mockDocumentBase64("hallticket", studentName, registerNumber),
      mimeType:  "image/svg+xml",
      verified:  true,
    },
    {
      type:      "photo",
      label:     "Passport Photo",
      dataUri:   mockDocumentBase64("photo", studentName, registerNumber),
      mimeType:  "image/svg+xml",
      verified:  true,
    },
  ];
}

// ── Build all 60 students ─────────────────────────────────────────────────────
function buildStudents() {
  const students = [];
  const courseName = "MCA";
  const courseDef  = COURSE_DEFS[courseName];

  for (let i = 0; i < 60; i++) {
    const firstName  = FIRST_NAMES[i];
    const lastName   = LAST_NAMES[i % LAST_NAMES.length];
    const name       = `${firstName} ${lastName}`;

    // MCA2024001 … MCA2024060
    const regNum = `MCA2024${String(i + 1).padStart(3, "0")}`;

    const email   = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@student.edu.in`;
    const mobile  = randomPhone();
    const dob     = randomDob();

    // Eligibility
    const hasBacklogs      = (i % 3 === 2);
    const resultsPublished = !(i % 7 === 6);
    const degreeEligible   = !hasBacklogs && resultsPublished;

    // Subjects & CGPA
    const subjects    = buildSubjects(courseDef, hasBacklogs);
    const cgpa        = calcCgpa(subjects);
    const totalCredits = subjects.reduce((sum, s) => sum + s.credits, 0);

    // Documents
    const documents = buildDocuments(name, regNum);

    students.push({
      registerNumber:   regNum,
      name,
      dob,
      mobile,
      email,
      hasBacklogs,
      resultsPublished,
      degreeEligible,
      course:           courseName,
      yearOfCompletion: 2024,
      cgpa,
      totalCredits,
      subjects,
      documents,
    });
  }

  return students;
}

// ── Seed ──────────────────────────────────────────────────────────────────────
const seed = async () => {
  try {
    await connectDB();
    console.log("🌱 Connected to DB — seeding students (v2)…\n");

    await Student.deleteMany({});
    console.log("🗑️  Cleared existing students.");

    const students = buildStudents();
    await Student.insertMany(students);

    const total    = students.length;
    const eligible = students.filter((s) => s.degreeEligible).length;
    const backlogs = students.filter((s) => s.hasBacklogs).length;
    const unpub    = students.filter((s) => !s.resultsPublished).length;

    console.log(`✅ Seeded ${total} students`);
    console.log(`   Eligible         : ${eligible}`);
    console.log(`   Has Backlogs     : ${backlogs}`);
    console.log(`   Results Unpublished: ${unpub}`);
    console.log("\n📋 Sample login credentials:");
    const eligible1 = students.find((s) => s.degreeEligible);
    const backlog1  = students.find((s) => s.hasBacklogs);
    const unpub1    = students.find((s) => !s.resultsPublished);
    if (eligible1)  console.log(`   Eligible   → registerNumber: ${eligible1.registerNumber}  dob: ${eligible1.dob}`);
    if (backlog1)   console.log(`   Backlogs   → registerNumber: ${backlog1.registerNumber}   dob: ${backlog1.dob}`);
    if (unpub1)     console.log(`   Unpublished→ registerNumber: ${unpub1.registerNumber}   dob: ${unpub1.dob}`);

    console.log(`\n\u{1F4DA} MCA: ${COURSE_DEFS["MCA"].subjects.length} subjects across 4 semesters`);

    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  }
};

seed();