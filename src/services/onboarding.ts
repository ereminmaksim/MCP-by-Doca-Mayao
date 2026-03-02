import rawOnboarding from '../data/onboardingData.json' with { type: 'json' };

import { ONBOARDING_ROUTE_BY_KEY } from '../config.js';
import { OnboardingGuide, onboardingGuideSchema } from '../schemas/onboarding.js';

type RawOnboardingDetail = {
  title: string;
  steps: string[];
  gallery?: string[];
};

type RawOnboardingTab = {
  title: string;
  sections: RawOnboardingDetail[];
};

type RawOnboardingGuide = {
  name: string;
  description: string;
  details?: RawOnboardingDetail[];
  tabs?: RawOnboardingTab[];
  links?: { title: string; url: string }[];
};

const normalize = (value: string) => value.trim().toLowerCase();

const flattenSections = (guide: RawOnboardingGuide) => {
  if (guide.details?.length) {
    return guide.details.map((detail) => ({
      title: detail.title,
      steps: detail.steps,
      gallery: detail.gallery,
    }));
  }

  if (guide.tabs?.length) {
    return guide.tabs.flatMap((tab) =>
      tab.sections.map((section) => ({
        title: `${tab.title}: ${section.title}`,
        steps: section.steps,
        gallery: section.gallery,
      })),
    );
  }

  return [];
};

const onboardingGuides = Object.entries(rawOnboarding as Record<string, RawOnboardingGuide>).map(([key, guide]) =>
  onboardingGuideSchema.parse({
    key,
    name: guide.name,
    description: guide.description,
    route: ONBOARDING_ROUTE_BY_KEY[key] ?? `/onboarding/${key}`,
    sections: flattenSections(guide),
    links: guide.links ?? [],
  }),
);

const onboardingByKey = new Map(onboardingGuides.map((guide) => [normalize(guide.key), guide]));

const scoreMatch = (guide: OnboardingGuide, query: string) => {
  const normalizedQuery = normalize(query);
  let score = 0;

  if (normalize(guide.key) === normalizedQuery) score += 100;
  if (normalize(guide.name) === normalizedQuery) score += 100;
  if (normalize(guide.name).includes(normalizedQuery)) score += 40;
  if (normalize(guide.description).includes(normalizedQuery)) score += 20;

  for (const section of guide.sections) {
    if (normalize(section.title).includes(normalizedQuery)) score += 12;
    for (const step of section.steps) {
      if (normalize(step).includes(normalizedQuery)) score += 4;
    }
  }

  return score;
};

export const listOnboardingGuides = () => onboardingGuides;

export const getOnboardingGuideByKey = (service: string) => {
  const normalized = normalize(service);
  return onboardingByKey.get(normalized) ?? onboardingGuides.find((guide) => normalize(guide.name) === normalized) ?? null;
};

export const searchOnboardingGuides = (query: string) => {
  return onboardingGuides
    .map((guide) => ({
      guide,
      score: scoreMatch(guide, query),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.guide.name.localeCompare(right.guide.name))
    .slice(0, 10);
};
