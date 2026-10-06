import en from './en.ts';
import vi from './vi.ts';
import type { Language } from './types.ts';

const dictionaries = { en, vi };
type TranslationKeys<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${TranslationKeys<T[K]>}`;
}[keyof T & string];

export type TranslationKey = TranslationKeys<typeof en>;
export type TranslationParams = Record<string, string | number>;

export const translate = (
  language: Language,
  key: TranslationKey,
  params: TranslationParams = {},
) => {
  const value = key.split('.').reduce<unknown>(
    (current, part) =>
      typeof current === 'object' && current !== null
        ? (current as Record<string, unknown>)[part]
        : undefined,
    dictionaries[language],
  );

  if (typeof value !== 'string') {
    throw new Error(`Missing translation for "${key}" in "${language}".`);
  }

  return value.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const replacement = params[name];
    if (replacement === undefined) {
      throw new Error(`Missing "${name}" interpolation for translation "${key}".`);
    }
    return String(replacement);
  });
};
