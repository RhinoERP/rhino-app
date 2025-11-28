/**
 * Generates a unique slug from a name
 * If the slug already exists, appends a number (e.g., "mi-org-1", "mi-org-2")
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Finds the next available slug by checking if it exists
 * If it exists, appends a number starting from 1
 */
export async function findUniqueSlug(
  baseSlug: string,
  checkExists: (slug: string) => Promise<boolean>
): Promise<string> {
  let slug = baseSlug;
  let counter = 0;

  while (await checkExists(slug)) {
    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }

  return slug;
}
