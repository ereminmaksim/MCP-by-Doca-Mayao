import { z } from 'zod';

export const sourceRouteSchema = z.string().min(1);

export const searchHitSchema = z.object({
  kind: z.enum(['component', 'onboarding']),
  title: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().min(1),
  route: sourceRouteSchema,
  score: z.number().nonnegative(),
});

export const searchDocsInputSchema = z.object({
  query: z.string().trim().min(1),
  domain: z.enum(['all', 'components', 'onboarding']).optional().default('all'),
});

export const componentLookupSchema = z.object({
  nameOrSlug: z.string().trim().min(1),
});

export const componentSearchSchema = z.object({
  query: z.string().trim().min(1),
});

export const onboardingLookupSchema = z.object({
  service: z.string().trim().min(1),
});

export const recommendComponentInputSchema = z.object({
  task: z.string().trim().min(1),
  constraints: z.array(z.string().trim().min(1)).optional().default([]),
});

export const compareComponentsInputSchema = z.object({
  items: z.array(z.string().trim().min(1)).min(2).max(5),
});

export type SearchHit = z.infer<typeof searchHitSchema>;
