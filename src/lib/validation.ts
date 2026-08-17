import { z } from "zod";

import { INVESTIGATOR_NAME, SEVERITIES } from "@/lib/constants";

export const createIncidentSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(200),
  service: z.string().min(1, "Select an affected service."),
  severity: z.enum(SEVERITIES as [string, ...string[]], {
    message: "Select a severity.",
  }),
  description: z
    .string()
    .trim()
    .min(10, "Describe the incident in at least 10 characters.")
    .max(4000),
  startedAt: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "Provide a valid start time."),
  deploymentId: z.string().trim().max(100).optional().nullable(),
  repository: z.string().trim().max(200).optional().nullable(),
  alertPayload: z.string().trim().max(8000).optional().nullable(),
});

export const planDecisionSchema = z.object({
  action: z.enum(["approve", "reject", "execute", "rollback"]),
  reason: z.string().trim().max(2000).optional(),
  approvedBy: z
    .string()
    .trim()
    .max(200)
    .optional()
    .default(INVESTIGATOR_NAME),
  executedBy: z
    .string()
    .trim()
    .max(200)
    .optional()
    .default(INVESTIGATOR_NAME),
});
