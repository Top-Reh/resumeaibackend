const express = require("express");
const multer = require("multer");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const GoogleGenerativeAI = require("@google/generative-ai").GoogleGenerativeAI;
const Resume = require("../models/Resume.js");

const router = express.Router();

// Ensure uploads folder exists
// if (!fs.existsSync("uploads")) {
//   fs.mkdirSync("uploads");
// }

const upload = multer({ dest: "uploads/" });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// upload.single("file"), 

router.post("/upload",async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  // const filePath = req.file.path;

  // try {
  //   // import pdf-parse inside route to avoid top-level await issues
  //   const { default: pdfParse } = await import("pdf-parse");

  //   // Step 1: Parse PDF text
  //   const pdfBuffer = fs.readFileSync(filePath);
  //   const pdfData = await pdfParse(pdfBuffer);

  //   // Step 2: (Skip Puppeteer Screenshot for now)
  //   const screenshotPath = null;

  //   // Step 3: AI Summary using Gemini (guard multiple possible result shapes)
  //   const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  //   const prompt = `Summarize this resume:\n\n${pdfData.text}`;

  //   let aiSummary = "";
  //   try {
  //     const result = await model.generateContent(prompt);

  //     // Try a few common shapes — adjust to actual SDK docs if different
  //     if (result?.response) {
  //       // response may be a string or have a text() method
  //       aiSummary = typeof result.response === "string"
  //         ? result.response
  //         : (typeof result.response.text === "function"
  //             ? result.response.text()
  //             : String(result.response));
  //     } else if (result?.output?.[0]?.content) {
  //       aiSummary = result.output[0].content;
  //     } else if (result?.candidates?.[0]?.output) {
  //       aiSummary = result.candidates[0].output;
  //     } else {
  //       aiSummary = JSON.stringify(result).slice(0, 2000);
  //     }
  //   } catch (aiErr) {
  //     console.warn("AI generation failed:", aiErr);
  //     aiSummary = "AI generation failed";
  //   }

  //   // Step 4: Save to MongoDB
  //   const newResume = new Resume({
  //     filename: req.file.originalname,
  //     screenshot: screenshotPath,
  //     aiSummary,
  //   });

  //   await newResume.save();

  //   res.json({ message: "Uploaded successfully", aiSummary });
  // } catch (error) {
  //   console.error("❌ Upload error:", error);
  //   res.status(500).json({ error: "Something went wrong", details: error.message });
  // } finally {
  //   // Step 5: Clean up uploaded file (optional) — guard existence
  //   try {
  //     if (filePath && fs.existsSync(filePath)) {
  //       fs.unlinkSync(filePath);
  //     }
  //   } catch (cleanupErr) {
  //     console.warn("Failed to remove temp file:", cleanupErr);
  //   }
  // }
    // const { default: pdfParse } = await import("pdf-parse");
    // const filePath = req.file.path;
    // // Step 1: Parse PDF text
    // const pdfBuffer = fs.readFileSync(filePath);
    // const pdfData = await pdfParse(pdfBuffer);
    // console.log("PDF text extracted:", pdfData.text.slice(0, 200));
    res.json({ message: "Uploaded successfully", aiSummary: "pdfData.text" });
});

export default router;
