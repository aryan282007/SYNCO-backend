/**
 * Sanitizes a raw text string by removing Personal Identifiable Information (PII).
 * 
 * @param {string} rawText - The unedited text extracted from a medical report.
 * @returns {string} - The safely redacted string ready for AI processing.
 */
function sanitizeMedicalText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return "";
  }
  
  let redactedText = rawText;

  // 1. Phone Numbers (various formats: (123) 456-7890, 123-456-7890, +1 123 456 7890)
  const phoneRegex = /(?:\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/g;
  redactedText = redactedText.replace(phoneRegex, '[REDACTED_PHONE]');

  // 2. Email Addresses
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  redactedText = redactedText.replace(emailRegex, '[REDACTED_EMAIL]');

  // 3. SSN or similar ID formats (XXX-XX-XXXX)
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
  redactedText = redactedText.replace(ssnRegex, '[REDACTED_ID]');

  // 4. Common Medical IDs / Registration Numbers (Heuristic: Alphanumeric strings longer than 8 chars often found in IDs)
  // This is a basic catch-all for potential IDs like "MRN: 123456789"
  const idRegex = /\b(?:MRN|ID|Patient ID|Reg No)[\s#:]*([A-Za-z0-9-]{6,})\b/gi;
  redactedText = redactedText.replace(idRegex, '[REDACTED_ID]');

  return redactedText;
}

module.exports = { sanitizeMedicalText };
