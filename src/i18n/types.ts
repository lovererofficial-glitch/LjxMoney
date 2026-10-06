export type TranslationShape<T> = T extends string
  ? string
  : { [K in keyof T]: TranslationShape<T[K]> };

export type Language = 'vi' | 'en';
