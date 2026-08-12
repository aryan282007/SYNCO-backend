const { sanitizeMedicalText } = require("./utils/piiSanitizer");

const mockRawPdfText = `
PATIENT MEDICAL REPORT
------------------------
Name: Jane Doe
Email: jane.doe@example.com
Phone: (555) 123-4567
Date of Birth: 01/15/1985

LAB RESULTS:
Hemoglobin: 11.2 g/dL (Low)
Testosterone: 65 ng/dL (High)
Insulin: 15 uIU/mL (Normal)

Dr. Smith Contact: dr.smith@hospital.org
`;

console.log("=== ORIGINAL TEXT ===");
console.log(mockRawPdfText);

console.log("\n=== SANITIZED TEXT ===");
const sanitized = sanitizeMedicalText(mockRawPdfText);
console.log(sanitized);

if (!sanitized.includes("Jane Doe") && !sanitized.includes("jane.doe@example.com") && !sanitized.includes("(555) 123-4567")) {
  console.log("\n✅ SUCCESS: PII has been scrubbed successfully!");
} else {
  console.log("\n❌ FAILURE: PII leaked through the sanitizer!");
}
