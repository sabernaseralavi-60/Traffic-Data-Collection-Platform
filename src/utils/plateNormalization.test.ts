import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePlateDigits,
  parsePersianSpokenDigits,
  formatPlateSuffix,
  validatePlateSuffix
} from './plateNormalization.ts';

test('normalizePlateDigits converts Persian and Arabic digits to ASCII', () => {
  assert.equal(normalizePlateDigits('۳۸۷'), '387');
  assert.equal(normalizePlateDigits('٠٤٢'), '042');
  assert.equal(normalizePlateDigits('۵۴۲-الف'), '542');
  assert.equal(normalizePlateDigits('abc-987-xyz'), '987');
});

test('parsePersianSpokenDigits handles spoken Persian digit sequences', () => {
  // Scenario: "سه هشت هفت" -> "387"
  assert.equal(parsePersianSpokenDigits('سه هشت هفت'), '387');
  
  // Scenario: "پنج چهار دو" -> "542"
  assert.equal(parsePersianSpokenDigits('پنج چهار دو'), '542');

  // Scenario: "صفر نه یک" -> "091" (preserves leading zero)
  assert.equal(parsePersianSpokenDigits('صفر نه یک'), '091');

  // Comma or punctuation separated speech recognition text
  assert.equal(parsePersianSpokenDigits('سه، هشت، هفت'), '387');

  // Mixed digit and Persian words
  assert.equal(parsePersianSpokenDigits('سه 8 هفت'), '387');
});

test('formatPlateSuffix and validatePlateSuffix', () => {
  assert.equal(formatPlateSuffix('42'), '042');
  assert.equal(formatPlateSuffix('387'), '387');
  assert.equal(formatPlateSuffix('12387'), '387');

  assert.equal(validatePlateSuffix('387').isValid, true);
  assert.equal(validatePlateSuffix('۳۸۷').isValid, true);
  assert.equal(validatePlateSuffix('38').isValid, false);
  assert.equal(validatePlateSuffix('').isValid, false);
});
