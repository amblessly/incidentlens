import { z } from "zod";

import { SEVERITIES } from "@/lib/constants";

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
  environment: z.string().trim().max(100).optional().nullable(),
});

/**
 * Plan decisions. The approving/executing identity always comes from the
 * session — clients only send the decision type and an optional reason.
 */
export const planDecisionSchema = z.object({
  action: z.enum(["approve", "reject", "execute", "rollback"]),
  reason: z.string().trim().max(2000).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Provide a valid email.").max(200),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(100),
  email: z.string().trim().email("Provide a valid email.").max(200),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  workspaceName: z.string().trim().min(2, "Workspace name is required.").max(100),
  environmentName: z.string().trim().max(100).optional(),
});

export const testConnectionSchema = z.object({
  connectionId: z.string().min(1),
});

export const createConnectionSchema = z.object({
  providerType: z.enum(["clanker", "demo"]),
  name: z.string().trim().min(2).max(100).optional(),
  environmentId: z.string().trim().optional().nullable(),
});

export const createApiKeySchema = z.object({
  name: z.string().trim().min(2).max(100),
  expiresAt: z.string().optional().nullable(),
});