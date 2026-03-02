import rawComponents from '../../../src/data/componentsData.json' with { type: 'json' };

import { ComponentDoc, componentDocSchema } from '../schemas/component.js';

const normalize = (value: string) => value.trim().toLowerCase();

const componentDocs = Object.values(rawComponents).map((component) => {
  const slug = normalize(component.name);
  return componentDocSchema.parse({
    ...component,
    slug,
    route: `/doca/shared/${slug}`,
  });
});

const componentsBySlug = new Map(componentDocs.map((component) => [component.slug, component]));

const scoreMatch = (component: ComponentDoc, query: string) => {
  const normalizedQuery = normalize(query);
  let score = 0;

  if (component.slug === normalizedQuery) score += 100;
  if (normalize(component.name) === normalizedQuery) score += 100;
  if (normalize(component.name).includes(normalizedQuery)) score += 40;
  if (normalize(component.description).includes(normalizedQuery)) score += 20;

  for (const prop of component.props) {
    if (normalize(prop.name).includes(normalizedQuery)) score += 12;
    if (normalize(prop.description).includes(normalizedQuery)) score += 6;
    if (normalize(prop.type).includes(normalizedQuery)) score += 4;
  }

  return score;
};

export const listComponents = () => componentDocs;

export const getComponentByNameOrSlug = (nameOrSlug: string) => {
  const normalized = normalize(nameOrSlug);
  return componentsBySlug.get(normalized) ?? componentDocs.find((component) => normalize(component.name) === normalized) ?? null;
};

export const searchComponents = (query: string) => {
  return componentDocs
    .map((component) => ({
      component,
      score: scoreMatch(component, query),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.component.name.localeCompare(right.component.name))
    .slice(0, 10);
};

const recommendationKeywords = [
  ['date', ['date', 'calendar', 'дата', 'календар', 'время', 'time', 'диапазон']],
  ['input', ['input', 'ввод', 'text', 'текст', 'поле', 'form', 'форма']],
  ['select', ['select', 'dropdown', 'choice', 'option', 'выбор', 'список']],
  ['modal', ['modal', 'dialog', 'confirm', 'popup', 'модал', 'диалог', 'подтвержден']],
  ['notify', ['notification', 'toast', 'alert', 'уведом', 'ошибка', 'success']],
  ['toggle', ['checkbox', 'toggle', 'radio', 'switch', 'флаж', 'переключ', 'radio']],
  ['button', ['button', 'action', 'cta', 'кноп', 'действие']],
  ['color', ['color', 'palette', 'цвет']],
  ['range', ['range', 'period', 'interval', 'диапазон', 'период']],
] as const;

const positiveSignalMatchers: Record<string, RegExp> = {
  date: /date|calendar|time|дата|календар|время/i,
  input: /input|text|textarea|form|ввод|текст|поле/i,
  select: /select|dropdown|option|список|tree\s*select/i,
  modal: /modal|confirm|dialog|popup|модал|диалог|подтвержд/i,
  notify: /notification|toast|alert|уведом|ошибк|success/i,
  toggle: /checkbox|radio|toggle|switch|флаж|переключ/i,
  button: /button|кноп/i,
  color: /color|palette|цвет/i,
  range: /range|period|interval|диапазон|период/i,
};

const negativeSignalMatchers: Partial<Record<string, RegExp[]>> = {
  date: [/input|textarea|select/i, /notification|toast|alert/i],
  select: [/datepicker|calendar|date/i],
  input: [/datepicker|daterange|calendar/i],
  modal: [/checkbox|radio|select/i],
};

const detectTaskSignals = (task: string, constraints: string[]) => {
  const haystack = normalize(`${task} ${constraints.join(' ')}`);
  const signals = new Set<string>();

  for (const [signal, keywords] of recommendationKeywords) {
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      signals.add(signal);
    }
  }

  return signals;
};

const scoreRecommendation = (component: ComponentDoc, task: string, constraints: string[]) => {
  const haystack = normalize(`${task} ${constraints.join(' ')}`);
  let score = scoreMatch(component, haystack);
  const signals = detectTaskSignals(task, constraints);
  const componentText = `${component.name} ${component.description} ${component.props.map((prop) => `${prop.name} ${prop.type}`).join(' ')}`;

  for (const signal of signals) {
    const positiveMatcher = positiveSignalMatchers[signal];
    if (positiveMatcher?.test(componentText)) {
      score += signal === 'range' ? 35 : 30;
    }

    const negativeMatchers = negativeSignalMatchers[signal] ?? [];
    if (negativeMatchers.some((matcher) => matcher.test(componentText))) {
      score -= 18;
    }
  }

  if (signals.has('date') && signals.has('range') && /daterange|range/i.test(componentText)) score += 25;
  if (signals.has('date') && signals.has('input') && /datetextinput/i.test(componentText)) score += 20;
  if (signals.has('input') && /textarea/i.test(componentText)) score += haystack.includes('длин') || haystack.includes('long') ? 20 : 8;
  if (signals.has('select') && /select/i.test(componentText)) score += 18;
  if (signals.has('modal') && /confirm/i.test(componentText)) score += 16;

  if (signals.has('date') && !positiveSignalMatchers.date.test(componentText)) score -= 35;
  if (signals.has('date') && /select|dropdown|tree/i.test(componentText)) score -= 24;
  if ((haystack.includes('длин') || haystack.includes('long')) && /textarea/i.test(componentText)) score += 30;
  if ((haystack.includes('длин') || haystack.includes('long')) && !/textarea|editor|text/i.test(componentText)) score -= 18;
  if (signals.has('input') && !positiveSignalMatchers.input.test(componentText)) score -= 10;

  for (const prop of component.props) {
    if (haystack.includes(normalize(prop.name))) score += 8;
    if (haystack.includes(normalize(prop.type))) score += 4;
  }

  if (signals.size > 0 && !Array.from(signals).some((signal) => positiveSignalMatchers[signal]?.test(componentText))) {
    score -= 12;
  }

  if (signals.has('date') && !positiveSignalMatchers.date.test(componentText)) {
    score = Math.min(score, 18);
  }

  if ((haystack.includes('длин') || haystack.includes('long')) && !/textarea|editor|text/i.test(componentText)) {
    score = Math.min(score, 16);
  }

  return score;
};

const buildRecommendationReason = (component: ComponentDoc, task: string, constraints: string[]) => {
  const signals = detectTaskSignals(task, constraints);

  if (signals.has('date') && /range|диапазон/i.test(component.name + component.description)) {
    return 'Подходит для сценариев выбора диапазона дат.';
  }

  if (signals.has('date') && /date|calendar|time/i.test(component.name + component.description)) {
    return 'Подходит для сценариев выбора даты или времени.';
  }

  if (signals.has('input') && /textarea/i.test(component.name + component.description)) {
    return 'Подходит для ввода большого текстового значения.';
  }

  if (signals.has('input') && /input/i.test(component.name + component.description)) {
    return 'Подходит для базового пользовательского ввода.';
  }

  if (signals.has('select') && /select|dropdown/i.test(component.name + component.description)) {
    return 'Подходит для выбора значения из набора опций.';
  }

  if (signals.has('modal') && /modal|confirm|dialog/i.test(component.name + component.description)) {
    return 'Подходит для подтверждения действия или изолированного диалога.';
  }

  if (signals.has('notify') && /notification|toast|alert/i.test(component.name + component.description)) {
    return 'Подходит для показа статуса или уведомления пользователю.';
  }

  return 'Совпадает по названию, описанию и доступным prop-полям.';
};

export const recommendComponents = (task: string, constraints: string[] = []) => {
  const signals = detectTaskSignals(task, constraints);
  const minimumScore = signals.size > 0 ? 24 : 1;
  const ranked = componentDocs
    .map((component) => ({
      component,
      score: scoreRecommendation(component, task, constraints),
      reason: buildRecommendationReason(component, task, constraints),
    }))
    .filter((entry) => entry.score >= minimumScore)
    .sort((left, right) => right.score - left.score || left.component.name.localeCompare(right.component.name));

  if (ranked.length === 0) {
    return [];
  }

  const bestScore = ranked[0].score;
  const dynamicThreshold = signals.size > 0 ? Math.max(minimumScore, bestScore - 28) : Math.max(minimumScore, bestScore - 40);
  const hasStrongLeader = bestScore >= 45;

  const signalFiltered =
    signals.size > 0 && hasStrongLeader
      ? ranked.filter((entry) => {
          const componentText = `${entry.component.name} ${entry.component.description} ${entry.component.props
            .map((prop) => `${prop.name} ${prop.type}`)
            .join(' ')}`;
          const hasSelectFocus =
            signals.has('select') &&
            /select|dropdown|tree\s*select/i.test(`${entry.component.name} ${entry.component.description}`);

          return (
            hasSelectFocus ||
            entry.score >= bestScore - 15 ||
            Array.from(signals).some((signal) => positiveSignalMatchers[signal]?.test(componentText))
          );
        })
      : ranked;

  let finalResults = signalFiltered.filter((entry) => entry.score >= dynamicThreshold);

  if (signals.has('select') && !signals.has('date') && hasStrongLeader) {
    finalResults = finalResults.filter((entry) =>
      /select|dropdown|tree\s*select/i.test(`${entry.component.name} ${entry.component.description}`),
    );
  }

  if (signals.has('date') && hasStrongLeader) {
    finalResults = finalResults.filter((entry) =>
      positiveSignalMatchers.date.test(`${entry.component.name} ${entry.component.description}`),
    );
  }

  if ((normalize(task).includes('длин') || normalize(task).includes('long')) && hasStrongLeader) {
    finalResults = finalResults.filter((entry) =>
      /textarea|editor|text/i.test(`${entry.component.name} ${entry.component.description}`),
    );
  }

  return finalResults.slice(0, 5);
};

export const compareComponents = (items: string[]) => {
  return items.map((item) => {
    const component = getComponentByNameOrSlug(item);
    return {
      lookup: item,
      component,
    };
  });
};

export const buildComponentPropDiff = (components: ComponentDoc[]) => {
  const propToOwners = new Map<string, Set<string>>();
  const propMeta = new Map<string, { type: string; default?: string }>();

  for (const component of components) {
    for (const prop of component.props) {
      if (!propToOwners.has(prop.name)) {
        propToOwners.set(prop.name, new Set());
      }
      propToOwners.get(prop.name)!.add(component.name);
      if (!propMeta.has(prop.name)) {
        propMeta.set(prop.name, { type: prop.type, default: prop.default });
      }
    }
  }

  const componentCount = components.length;
  const sharedProps: Array<{ name: string; type: string; default?: string }> = [];
  const uniquePropsByComponent: Record<string, Array<{ name: string; type: string; default?: string }>> = {};

  for (const component of components) {
    uniquePropsByComponent[component.name] = [];
  }

  for (const [propName, owners] of propToOwners.entries()) {
    const meta = propMeta.get(propName)!;
    if (owners.size === componentCount) {
      sharedProps.push({ name: propName, type: meta.type, default: meta.default });
      continue;
    }

    for (const owner of owners) {
      uniquePropsByComponent[owner].push({ name: propName, type: meta.type, default: meta.default });
    }
  }

  for (const component of components) {
    uniquePropsByComponent[component.name].sort((left, right) => left.name.localeCompare(right.name));
  }

  sharedProps.sort((left, right) => left.name.localeCompare(right.name));

  return { sharedProps, uniquePropsByComponent };
};
