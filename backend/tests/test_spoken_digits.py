import unittest

from backend.spoken_digits import parse_digits


class TestSpokenDigits(unittest.TestCase):
    def test_digit_by_digit(self):
        self.assertEqual(parse_digits("سه هشت هفت"), "387")
        self.assertEqual(parse_digits("صفر چهار دو"), "042")  # leading zero kept
        self.assertEqual(parse_digits(["پنج", "یک", "نه"]), "519")

    def test_colloquial_and_arabic_letter_forms(self):
        self.assertEqual(parse_digits("چار شیش یه"), "461")
        self.assertEqual(parse_digits("يك دو سه"), "123")      # Arabic yeh/kaf instead of Persian ی/ک
        self.assertEqual(parse_digits("هشت‌ هفت نه"), "879")  # a zero-width non-joiner inside a word

    def test_digit_characters_and_latin_words(self):
        self.assertEqual(parse_digits("۳ ۸ ۷"), "387")
        self.assertEqual(parse_digits("٣ ٨ ٧"), "387")
        self.assertEqual(parse_digits("۳۸۷"), "387")
        self.assertEqual(parse_digits("three eight seven"), "387")

    def test_number_words(self):
        self.assertEqual(parse_digits("سیصد و هشتاد و هفت"), "387")
        self.assertEqual(parse_digits("صد و پنج"), "105")
        self.assertEqual(parse_digits("دویست و ده"), "210")
        self.assertEqual(parse_digits("نهصد و نود و نه"), "999")
        self.assertEqual(parse_digits("پانصد و دوازده"), "512")

    def test_refuses_to_guess(self):
        for bad in ("", "سه هشت", "سه هشت هفت نه", "سی و هشت", "بیست", "سه [unk] هفت", "سلام", "سیصد هشتاد هفت نه", "هفت سیصد"):
            self.assertIsNone(parse_digits(bad), bad)

    def test_longer_sequences_only_when_asked(self):
        self.assertIsNone(parse_digits("یک دو سه چهار"))
        self.assertEqual(parse_digits("یک دو سه چهار", allow_longer=True), "234")


if __name__ == "__main__":
    unittest.main()
