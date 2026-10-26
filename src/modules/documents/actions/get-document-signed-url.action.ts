"use server";

import { createDocumentSignedUrl } from "../server/documents-storage.service";

type GetDocumentSignedUrlResult =
  | { success: true; url: string }
  | { success: false; error: string };

export async function getDocumentSignedUrlAction(
  reference: string
): Promise<GetDocumentSignedUrlResult> {
  try {
    return {
      success: true,
      url: await createDocumentSignedUrl(reference),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo autorizar el documento",
    };
  }
}
