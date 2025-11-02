// server.js (CommonJS)
const express = require("express");
const mongoose = require("mongoose"); 
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse"); 
const Resume = require("./models/Resume");


dotenv.config();
const GoogleGenerativeAI = require("@google/generative-ai").GoogleGenerativeAI;


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();

app.use(cors());
app.use(express.json());

// ensure uploads folder exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("Created uploads directory:", uploadsDir);
}

// multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// test route
app.get("/", (req, res) => res.send("Server healthy"));

// upload route (single file field name: "resume")
app.post("/api/resume/upload", upload.single("resume"), async (req, res) => {
  try {
    console.log("req.file:", req.file); // <--- very useful for debugging

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path; // full relative path like "C:\.../uploads/123-resume.pdf" on windows or "uploads/..." on linux
    // read file buffer
    const pdfBuffer = fs.readFileSync(filePath);

    // parse pdf
    const pdfData = await pdfParse(pdfBuffer);

    // Step 3: AI Summary using Gemini with retries + fallback models
    const modelEnv = process.env.GENERATIVE_MODEL || "models/gemini-2.5-flash";
    // allow comma-separated list in env for fallback order
    const modelCandidates = modelEnv.split(",").map(s => s.trim()).filter(Boolean);
    console.log("Using generative model candidates:", modelCandidates);

    // const prompt = `
    // Analyze this resume and return JSON with:
    // { "score": number, "skills": [], "strengths": [], "suggestions": [] }

    // Resume text:
    // ${pdfData.text}
    // `;

    const prompt = `
  You are an assistant that MUST respond with valid JSON only. Do NOT output any text, explanation, markdown, or code fences. Return exactly one JSON object and nothing else.
  
  Schema (required):
  {
    "score": number,            // integer 0-100 representing resume quality
    "skills": [string],         // array of key skills
    "strengths": [string],      // short bullet sentences describing strengths
    "suggestions": [string]     // short suggestion sentences, may include punctuation
  }
  
  Rules:
  - Output must be valid JSON parseable by JSON.parse().
  - Do NOT include markdown, backticks, or any extra fields outside the schema (you may include the fields above even if empty).
  - Numbers must be numeric (not strings). Strings must be plain text.
  - Keep arrays concise; each array element should be a single string.
  
  Now analyze the resume text below and produce the JSON object that follows the schema exactly.
  
  Resume text:
  ${pdfData.text}
  `;

    // retry helper
    async function generateWithRetries(modelName, prompt, maxAttempts = 4) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          return await model.generateContent(prompt);
        } catch (err) {
          const status = err && err.status;
          const retryable = status === 503 || status === 429 || status === 500;
          if (!retryable || attempt === maxAttempts) {
            throw err;
          }
          // exponential backoff + jitter
          const base = Math.pow(2, attempt) * 300;
          const jitter = Math.floor(Math.random() * 300);
          const wait = base + jitter;
          console.warn(`Model ${modelName} attempt ${attempt} failed (status=${status}). retrying in ${wait}ms`);
          await new Promise(r => setTimeout(r, wait));
        }
      }
      throw new Error("Retries exhausted");
    }

    let aiSummary = "";
    let lastErr = null;
    for (const candidate of modelCandidates) {
      try {
        const result = await generateWithRetries(candidate, prompt, 4);
        // parse result (keep existing tolerant parsing)
        if (result?.response) {
          aiSummary = typeof result.response === "string"
            ? result.response
            : (typeof result.response.text === "function"
                ? await result.response.text()
                : String(result.response));
        } else if (result?.output?.[0]?.content) {
          aiSummary = result.output[0].content;
        } else if (result?.candidates?.[0]?.output) {
          aiSummary = result.candidates[0].output;
        } else {
          aiSummary = JSON.stringify(result).slice(0, 2000);
        }
        lastErr = null;
        break; // success
      } catch (e) {
        console.warn(`Candidate model ${candidate} failed:`, e && e.message);
        lastErr = e;
        // try next candidate
      }
    }

    if (!aiSummary) {
      console.warn("AI generation final failure:", lastErr);
      // surface a clear transient error to client
      return res.status(503).json({ error: "AI model temporarily unavailable. Please try again later." });
    }
    function extractJsonFromString(text) {
      if (typeof text !== "string") return null;
      let s = text.trim();

      // strip leading/trailing triple-backtick fences (``` or ```json)
      if (s.startsWith("```")) {
        const firstNewline = s.indexOf("\n");
        if (firstNewline !== -1) s = s.slice(firstNewline + 1);
      }
      if (s.endsWith("```")) {
        s = s.slice(0, -3);
      }
      s = s.trim();

      // find first balanced JSON object {...}
      const start = s.indexOf("{");
      if (start === -1) return null;
      let depth = 0;
      for (let i = start; i < s.length; i++) {
        const ch = s[i];
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            const candidate = s.slice(start, i + 1);
            try {
              return JSON.parse(candidate);
            } catch (e) {
              return null;
            }
          }
        }
      }
      return null;
    }

    let aiSummaryObj;
    if (typeof aiSummary === "object" && aiSummary !== null) {
      aiSummaryObj = aiSummary;
    } else {
      // try to extract JSON from fenced codeblock or text
      const extracted = extractJsonFromString(String(aiSummary || ""));
      if (extracted) {
        aiSummaryObj = extracted;
      } else {
        // final fallback: try direct parse, otherwise return text
        try {
          aiSummaryObj = JSON.parse(String(aiSummary || ""));
        } catch (parseErr) {
          aiSummaryObj = { text: aiSummary };
        }
      }
    }
    // respond
    return res.json({
      message: "Uploaded successfully",
      fileName: req.file.filename,
      originalName: req.file.originalname,
      aiSummary: aiSummaryObj,
      pdffilebuffer:pdfBuffer,
    });
  } catch (err) {
    console.error("❌ Error parsing PDF:", err);
    return res.status(500).json({ error: "Failed to parse PDF", details: err.message });
  }
  
});

app.post("/api/resume/save", async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: "Empty request body" });
    }

    // Create document from req.body (ensure fields match your schema)
    const resumeDoc = new Resume(req.body);
    const saved = await resumeDoc.save();

    return res.status(201).json({ message: "Resume saved", id: saved._id, resume: saved });
  } catch (err) {
    console.error("Failed to save resume:", err);
    return res.status(500).json({ error: "Failed to save resume", details: err.message });
  }
});

app.get("/api/resume", async (req, res) => {
  try {
    const resumes = await Resume.find().sort({ createdAt: -1 }); // latest first
    res.json(resumes);
  } catch (error) {
    console.error("❌ Failed to fetch resumes:", error);
    res.status(500).json({ error: "Failed to fetch resumes" });
  }
});

app.get("/api/resume/:id", async (req, res) => {
  try {
    const resume = await Resume.findById(req.params.id);
    if (!resume) {
      return res.status(404).json({ error: "Resume not found" });
    }
    res.json(resume);
  } catch (error) {
    console.error("❌ Failed to fetch resume:", error);
    res.status(500).json({ error: "Failed to fetch resume" });
  }
});

app.delete("/api/resume/delete/:id", async (req, res) => {
  try {
    const deleted = await Resume.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Resume not found" });
    }
    res.json({ message: "Resume deleted" });
  } catch (error) {
    console.error("❌ Failed to delete resume:", error);
    res.status(500).json({ error: "Failed to delete resume" });
  }
});

app.get("/api/resume/download/:id", async (req, res) => {
  try {
    const resume = await Resume.findById(req.params.id);
    if (!resume || !resume.pdffile) {
      return res.status(404).send("Resume not found");
    }

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${resume.firstname}_${resume.lastname}_resume.pdf"`
    });
    res.send(resume.pdffile);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error downloading file");
  }
});

const MONGO = process.env.MONGODB_URI;
mongoose
  .connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Mongo connected"))
  .catch((e) => console.error("Mongo connect error", e));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
