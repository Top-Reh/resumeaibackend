const mongoose = require("mongoose");

const resumeSchema = new mongoose.Schema({
  firstname: String,
  lastname: String,
  pdffile: Buffer,
  jobtitle: String,
  email: String,
  phonenumber: String,
  aisummary: Object,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Resume", resumeSchema);