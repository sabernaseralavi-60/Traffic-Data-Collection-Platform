/**
 * Plate Digit & Persian Speech Normalization Utility
 * Supports Persian (Farsi), Arabic, and ASCII numerals and spoken digit word sequences.
 */

// Persian and Arabic numeral mapping
const PERSIAN_DIGIT_MAP: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

// Spoken Persian digit words mapping
const SPOKEN_PERSIAN_WORDS: Record<string, string> = {
  'صفر': '0',
  'یک': '1',
  'یه': '1',
  'دو': '2',
  'سه': '3',
  'چهار': '4',
  'چار': '4',
  'پنج': '5',
  'شش': '6',
  'شیش': '6',
  'هفت': '7',
  'هشت': '8',
  'نه': '9',
  // English words as fallback
  'zero': '0',
  'one': '1',
  'two': '2',
  'three': '3',
  'four': '4',
  'five': '5',
  'six': '6',
  'seven': '7',
  'eight': '8',
  'nine': '9',
};

/**
 * Normalizes any string containing Persian, Arabic, or ASCII digits to plain ASCII digits.
 * Strips non-digit punctuation.
 */
export function normalizePlateDigits(input: string): string {
  if (!input) return '';
  let result = '';
  for (const char of input) {
    if (PERSIAN_DIGIT_MAP[char] !== undefined) {
      result += PERSIAN_DIGIT_MAP[char];
    } else if (/[0-9]/.test(char)) {
      result += char;
    }
  }
  return result;
}

/**
 * Parses spoken speech recognition output (e.g. from Web Speech API 'fa-IR')
 * such as: "سه هشت هفت" -> "387"
 * "پنج چهار دو" -> "542"
 * "صفر نه یک" -> "091"
 * Also handles mixed numeric/word output or comma separated words.
 */
export function parsePersianSpokenDigits(speechText: string): string {
  if (!speechText) return '';
  const cleaned = speechText.trim().toLowerCase();

  // First convert individual words
  // Replace delimiters with spaces
  const tokens = cleaned.replace(/[,،\-._/]/g, ' ').split(/\s+/);
  let digits = '';

  for (const token of tokens) {
    if (!token) continue;
    // Direct word match
    if (SPOKEN_PERSIAN_WORDS[token] !== undefined) {
      digits += SPOKEN_PERSIAN_WORDS[token];
    } else {
      // Check if it already contains numeric characters (Persian/Arabic/ASCII)
      const normalizedChars = normalizePlateDigits(token);
      if (normalizedChars) {
        digits += normalizedChars;
      }
    }
  }

  // If no digits found, try raw digit normalization on the whole text
  if (!digits) {
    digits = normalizePlateDigits(cleaned);
  }

  // If longer than 3 digits, usually the last 3 digits represent the vehicle suffix
  if (digits.length > 3) {
    return digits.slice(-3);
  }

  return digits;
}

/**
 * Formats a 3-digit suffix with leading zeroes if needed.
 */
export function formatPlateSuffix(raw: string): string {
  const digits = normalizePlateDigits(raw);
  if (!digits) return '';
  if (digits.length <= 3) {
    return digits.padStart(3, '0');
  }
  return digits.slice(-3);
}

/**
 * Validates whether the suffix is suitable for collection.
 */
export function validatePlateSuffix(raw: string): { isValid: boolean; message?: string } {
  const digits = normalizePlateDigits(raw);
  if (!digits) {
    return { isValid: false, message: 'Please enter a 3-digit plate suffix' };
  }
  if (digits.length !== 3) {
    return { isValid: false, message: 'Vehicle plate suffix must be exactly 3 digits' };
  }
  return { isValid: true };
}
