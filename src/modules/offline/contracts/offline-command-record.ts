import { z } from "zod";
import {
  commercialChangeSchema,
  offlineCommandV1Schema,
} from "./offline-command";

export const offlineCommandStatusSchema = z.enum([
  "queued",
  "syncing",
  "requires-review",
  "failed",
  "synced",
]);

export const storedOfflineCommandSchema = z
  .object({
    commandId: z.string().uuid(),
    draftId: z.string().uuid(),
    ownerUserId: z.string().uuid(),
    organizationId: z.string().uuid(),
    status: offlineCommandStatusSchema,
    attemptCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    lastAttemptAt: z.string().datetime().nullable(),
    nextAttemptAt: z.string().datetime().nullable(),
    leaseOwnerId: z.string().uuid().nullable().optional(),
    leaseExpiresAt: z.string().datetime().nullable().optional(),
    resourceId: z.string().uuid().nullable(),
    lastError: z
      .object({
        code: z.enum([
          "AUTH_REQUIRED",
          "FORBIDDEN",
          "VALIDATION_ERROR",
          "STALE_REFERENCE",
          "REVIEW_REQUIRED",
          "RETRYABLE",
        ]),
        message: z.string().min(1).max(500),
        retryable: z.boolean(),
        changes: z.array(commercialChangeSchema).optional(),
      })
      .strict()
      .nullable(),
    command: offlineCommandV1Schema,
  })
  .strict()
  .superRefine((record, context) => {
    const matchingFields = [
      ["commandId", record.commandId, record.command.commandId],
      ["ownerUserId", record.ownerUserId, record.command.ownerUserId],
      ["organizationId", record.organizationId, record.command.organizationId],
      ["createdAt", record.createdAt, record.command.createdAt],
    ] as const;

    for (const [field, recordValue, commandValue] of matchingFields) {
      if (recordValue !== commandValue) {
        context.addIssue({
          code: "custom",
          message: `El campo ${field} no coincide con el comando`,
          path: [field],
        });
      }
    }
  });

export type OfflineCommandStatus = z.infer<typeof offlineCommandStatusSchema>;
export type StoredOfflineCommand = z.infer<typeof storedOfflineCommandSchema>;
