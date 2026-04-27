const DIGIT_PATTERN = /\d/;

function normalizeProductName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function abbreviateWord(word: string, maxLength: number): string {
  if (word.length <= maxLength || DIGIT_PATTERN.test(word)) {
    return word;
  }

  if (maxLength <= 1) {
    return word.slice(0, maxLength);
  }

  return `${word.slice(0, maxLength - 1)}.`;
}

function abbreviateWords(
  words: string[],
  firstLength: number,
  restLength: number
): string {
  return words
    .map((word, index) =>
      abbreviateWord(word, index === 0 ? firstLength : restLength)
    )
    .join(" ");
}

export function abbreviateTicketProductName(
  value: string,
  maxLength: number
): string {
  const normalizedName = normalizeProductName(value);
  if (normalizedName.length <= maxLength) {
    return normalizedName;
  }

  const words = normalizedName.split(" ").filter(Boolean);
  if (words.length <= 1) {
    return abbreviateWord(normalizedName, maxLength);
  }

  for (let restLength = 5; restLength >= 2; restLength -= 1) {
    const candidate = abbreviateWords(words, 2, restLength);
    if (candidate.length <= maxLength) {
      return candidate;
    }
  }

  const initials = words.map((word) => abbreviateWord(word, 2)).join(" ");
  if (initials.length <= maxLength) {
    return initials;
  }

  const compactInitials = words.map((word) => abbreviateWord(word, 2)).join("");
  if (compactInitials.length <= maxLength) {
    return compactInitials;
  }

  return abbreviateWord(normalizedName, maxLength);
}
