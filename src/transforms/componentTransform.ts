import { ComponentDoc, ComponentSummary } from '../schemas/component.js';

export const buildComponentSummary = (component: ComponentDoc): ComponentSummary => ({
  name: component.name,
  slug: component.slug,
  description: component.description,
  route: component.route,
});

export const serializeResource = (value: unknown) => JSON.stringify(value, null, 2);
