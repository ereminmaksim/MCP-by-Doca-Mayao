import { z } from 'zod';

export const onboardingSectionSchema = z.object({
  title: z.string().min(1),
  steps: z.array(z.string().min(1)),
  gallery: z.array(z.string().min(1)).optional(),
});

export const onboardingGuideSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  route: z.string().min(1),
  sections: z.array(onboardingSectionSchema),
  links: z.array(
    z.object({
      title: z.string().min(1),
      url: z.string().url(),
    }),
  ),
});

export const onboardingGuideSummarySchema = onboardingGuideSchema.pick({
  key: true,
  name: true,
  description: true,
  route: true,
});

export type OnboardingGuide = z.infer<typeof onboardingGuideSchema>;
export type OnboardingGuideSummary = z.infer<typeof onboardingGuideSummarySchema>;
