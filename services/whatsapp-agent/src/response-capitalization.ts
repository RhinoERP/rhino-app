export const responseCapitalizations = ["STANDARD", "LOWERCASE"] as const;

const caseSensitiveText =
  /(https?:\/\/\S+|www\.\S+|[\w.%+-]+@[\w.-]+\.[a-z]{2,}|\b(?=[\w-]*[a-z])(?=[\w-]*\d)[\w-]+\b)/gi;

export function formatAssistantReply(text: string, capitalization: unknown) {
  const formatted = text.replaceAll("¿", "");
  if (capitalization !== "LOWERCASE") {
    return formatted;
  }

  // Captured links, email addresses and alphanumeric codes retain their case.
  return formatted
    .split(caseSensitiveText)
    .map((part, index) => (index % 2 === 0 ? part.toLowerCase() : part))
    .join("");
}
