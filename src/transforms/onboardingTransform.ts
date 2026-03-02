import { OnboardingGuide, OnboardingGuideSummary } from '../schemas/onboarding.js';

export const buildOnboardingSummary = (guide: OnboardingGuide): OnboardingGuideSummary => ({
  key: guide.key,
  name: guide.name,
  description: guide.description,
  route: guide.route,
});
