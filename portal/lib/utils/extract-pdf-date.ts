'use client';

import { pdfjs } from 'react-pdf';

// Common date patterns to look for in document text
const DATE_PATTERNS = [
  // DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
  /(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/,
  // YYYY-MM-DD (ISO)
  /(\d{4})-(\d{1,2})-(\d{1,2})/,
  // Month DD, YYYY (English)
  /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i,
  // DD Month YYYY (English)
  /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
  // Turkish months: Ocak, Şubat, Mart, Nisan, Mayıs, Haziran, Temmuz, Ağustos, Eylül, Ekim, Kasım, Aralık
  /(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4})/i,
];

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  ocak: 0, şubat: 1, mart: 2, nisan: 3, mayıs: 4, haziran: 5,
  temmuz: 6, ağustos: 7, eylül: 8, ekim: 9, kasım: 10, aralık: 11,
};

function parseFoundDate(match: RegExpMatchArray, pattern: RegExp): Date | null {
  try {
    const src = pattern.source;

    if (src.startsWith('(\\d{4})')) {
      // YYYY-MM-DD
      const year = parseInt(match[1]!, 10);
      const month = parseInt(match[2]!, 10) - 1;
      const day = parseInt(match[3]!, 10);
      return new Date(year, month, day);
    }

    if (src.includes('January|February') || src.includes('Ocak|Şubat')) {
      // Has month name
      const parts = match.slice(1);
      const monthStr = parts.find(p => isNaN(Number(p)));
      const nums = parts.filter(p => !isNaN(Number(p))).map(Number);
      if (!monthStr || nums.length < 2) return null;

      const month = MONTH_MAP[monthStr.toLowerCase()];
      if (month === undefined) return null;

      const year = nums.find(n => n > 31) ?? nums[1]!;
      const day = nums.find(n => n <= 31) ?? nums[0]!;
      return new Date(year, month, day);
    }

    // DD/MM/YYYY pattern
    const day = parseInt(match[1]!, 10);
    const month = parseInt(match[2]!, 10) - 1;
    const year = parseInt(match[3]!, 10);
    if (year < 1900 || year > 2100 || month < 0 || month > 11 || day < 1 || day > 31) return null;
    return new Date(year, month, day);
  } catch {
    return null;
  }
}

/**
 * Extract a date from the first 3 pages of a PDF file.
 * Returns the first valid date found, or null.
 */
export async function extractDateFromPdf(file: File): Promise<Date | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const maxPages = Math.min(pdf.numPages, 3);

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');

      for (const pattern of DATE_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
          const date = parseFoundDate(match, pattern);
          if (date && !isNaN(date.getTime())) {
            return date;
          }
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
