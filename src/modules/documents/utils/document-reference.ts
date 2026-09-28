const DOCUMENTS_BUCKET = "documents";

export function getDocumentPath(reference: string): string | null {
  const value = reference.trim();
  if (!value) {
    return null;
  }

  let path = value.split("?", 1)[0] ?? "";

  try {
    const url = new URL(value);
    const marker = "/storage/v1/object/";
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) {
      return null;
    }

    const storagePath = url.pathname.slice(markerIndex + marker.length);
    const parts = storagePath.split("/");
    if (parts[0] === "public" || parts[0] === "sign") {
      parts.shift();
    }
    if (parts.shift() !== DOCUMENTS_BUCKET) {
      return null;
    }
    path = parts.join("/");
  } catch {
    // Plain object paths are the canonical format for new records.
  }

  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }

  const segments = path.split("/");
  if (
    path.startsWith("/") ||
    segments.length < 2 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return null;
  }

  return path;
}
