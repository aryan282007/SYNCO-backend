const { SyncRedactor } = require('redact-pii');

/**
 * Initializes a synchronous PII redactor.
 * By default, this will mathematically scrub names, emails, passwords,
 * phone numbers, IP addresses, and other sensitive markers.
 */
const redactor = new SyncRedactor();

/**
 * Sanitizes a raw text string by removing all Personal Identifiable Information (PII).
 * 
 * @param {string} rawText - The unedited text extracted from a medical report.
 * @returns {string} - The safely redacted string ready for AI processing.
 */
function sanitizeMedicalText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return "";
  }
  
  // Use redact-pii to replace sensitive data with 'REDACTED' or similar placeholders
  const redactedText = redactor.redact(rawText);
  return redactedText;
}

module.exports = { sanitizeMedicalText };
