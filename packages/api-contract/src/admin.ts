import { oc } from "@orpc/contract";
import * as v from "valibot";

export const vRepository = v.object({
  id: v.string(),
  slug: v.string(),
  teamId: v.nullable(v.string()),
});

export const vKeySummary = v.object({
  id: v.string(),
  name: v.nullable(v.string()),
  start: v.nullable(v.string()),
  repositorySlug: v.nullable(v.string()),
  scope: v.picklist(["read", "read-write"]),
  expiresAt: v.nullable(v.string()),
  enabled: v.boolean(),
  lastRequest: v.nullable(v.string()),
  createdAt: v.string(),
});

const vScope = v.picklist(["read", "read-write"]);

export const adminContract = {
  repositories: {
    list: oc.output(v.object({ repositories: v.array(vRepository) })),
  },
  keys: {
    list: oc.output(v.object({ keys: v.array(vKeySummary) })),
    create: oc
      .input(
        v.object({
          repositorySlug: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
          teamId: v.optional(
            v.pipe(v.string(), v.minLength(1), v.maxLength(100))
          ),
          scope: vScope,
          expiresInDays: v.pipe(
            v.number(),
            v.integer(),
            v.minValue(1),
            v.maxValue(365)
          ),
        })
      )
      .output(
        v.object({
          id: v.string(),
          key: v.string(),
          expiresAt: v.string(),
        })
      ),
    revoke: oc
      .input(v.object({ id: v.string() }))
      .output(v.object({ success: v.literal(true) })),
  },
};

export type KeySummary = v.InferOutput<typeof vKeySummary>;
export type Repository = v.InferOutput<typeof vRepository>;
