import { z } from "zod";

export const UploadsConfigResponseSchema = z.object({
  enabled: z.boolean(),
  maxAudioBytes: z.number().int().positive().nullable(),
  maxVideoBytes: z.number().int().positive().nullable(),
  maxImageBytes: z.number().int().positive().nullable(),
  maxPdfBytes: z.number().int().positive().nullable(),
  minAudioBytes: z.number().int().positive().nullable(),
  minVideoBytes: z.number().int().positive().nullable(),
});

export const UploadResponseSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  mimeType: z.string().nullable(),
});

export type UploadsConfigResponse = z.infer<typeof UploadsConfigResponseSchema>;
export type UploadResponse = z.infer<typeof UploadResponseSchema>;
