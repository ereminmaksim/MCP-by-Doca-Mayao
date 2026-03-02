import { z } from 'zod';

export const componentPropSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  default: z.string().optional(),
  description: z.string().min(1),
});

export const componentDocSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().min(1),
  props: z.array(componentPropSchema),
  examples: z.array(z.string()),
  route: z.string().min(1),
});

export const componentSummarySchema = componentDocSchema.pick({
  name: true,
  slug: true,
  description: true,
  route: true,
});

export type ComponentDoc = z.infer<typeof componentDocSchema>;
export type ComponentSummary = z.infer<typeof componentSummarySchema>;
