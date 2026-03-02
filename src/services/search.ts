import { SearchHit } from '../schemas/common.js';

import { searchComponents } from './components.js';
import { searchOnboardingGuides } from './onboarding.js';

export const searchDocs = (query: string, domain: 'all' | 'components' | 'onboarding' = 'all'): SearchHit[] => {
  const hits: SearchHit[] = [];

  if (domain === 'all' || domain === 'components') {
    hits.push(
      ...searchComponents(query).map(({ component, score }) => ({
        kind: 'component' as const,
        title: component.name,
        slug: component.slug,
        description: component.description,
        route: component.route,
        score,
      })),
    );
  }

  if (domain === 'all' || domain === 'onboarding') {
    hits.push(
      ...searchOnboardingGuides(query).map(({ guide, score }) => ({
        kind: 'onboarding' as const,
        title: guide.name,
        slug: guide.key,
        description: guide.description,
        route: guide.route,
        score,
      })),
    );
  }

  return hits.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title)).slice(0, 12);
};
