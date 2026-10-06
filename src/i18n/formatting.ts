import { format as formatDateFns } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';

import type { Language } from './types';

const locales = { en: enUS, vi };

export const formatLocalizedDate = (date: Date | number, pattern: string, language: Language) =>
  formatDateFns(date, pattern, { locale: locales[language] });

export const formatLocalizedCurrency = (value: number, language: Language) =>
  new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);

export const formatLocalizedNumber = (value: number, language: Language) =>
  new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(value);
