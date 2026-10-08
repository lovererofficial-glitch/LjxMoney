import { useCallback } from 'react';

import { useLanguageStore } from './runtime';
import { translate } from './translate';
import type { TranslationKey, TranslationParams } from './translate';

export { translate } from './translate';
export { localizeWalletName } from './walletLocalization';
export type { TranslationKey, TranslationParams } from './translate';

export const useI18n = () => {
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(language, key, params),
    [language],
  );

  return { language, setLanguage, t };
};

const categoryTranslationKeys: Record<string, TranslationKey> = {
  food: 'category.food',
  coffee: 'category.coffee',
  transport: 'category.transport',
  entertainment: 'category.entertainment',
  shopping: 'category.shopping',
  housing: 'category.housing',
  health: 'category.health',
  education: 'category.education',
  personal: 'category.personal',
  gift: 'category.gift',
  'other-expense': 'category.otherExpense',
  'old-other-expense': 'category.otherExpense',
  salary: 'category.salary',
  freelance: 'category.freelance',
  bonus: 'category.bonus',
  'other-income': 'category.otherIncome',
};

export const localizeCategoryName = (
  id: string,
  name: string,
  t: (key: TranslationKey, params?: TranslationParams) => string,
) => {
  const key = categoryTranslationKeys[id];
  return key ? t(key) : name;
};

export const localizeWalletType = (
  type: 'cash' | 'bank' | 'ewallet' | 'card' | 'savings' | 'other',
  t: (key: TranslationKey, params?: TranslationParams) => string,
) => t(`wallet.${type}`);

const weekdayTranslationKeys: Record<string, TranslationKey> = {
  monday: 'weekday.monday',
  tuesday: 'weekday.tuesday',
  wednesday: 'weekday.wednesday',
  thursday: 'weekday.thursday',
  friday: 'weekday.friday',
  saturday: 'weekday.saturday',
  sunday: 'weekday.sunday',
};

export const localizeWeekday = (
  weekday: string,
  t: (key: TranslationKey, params?: TranslationParams) => string,
) => {
  const key = weekdayTranslationKeys[weekday.toLowerCase()];
  return key ? t(key) : weekday;
};

const shortWeekdayTranslationKeys: Record<string, TranslationKey> = {
  monday: 'weekday.shortMonday',
  tuesday: 'weekday.shortTuesday',
  wednesday: 'weekday.shortWednesday',
  thursday: 'weekday.shortThursday',
  friday: 'weekday.shortFriday',
  saturday: 'weekday.shortSaturday',
  sunday: 'weekday.shortSunday',
};

export const localizeShortWeekday = (
  weekday: string,
  t: (key: TranslationKey, params?: TranslationParams) => string,
) => {
  const key = shortWeekdayTranslationKeys[weekday.toLowerCase()];
  return key ? t(key) : weekday;
};

const walletErrorKeys: Record<string, TranslationKey> = {
  'Amount must be a positive whole number of VND.': 'validation.amountPositive',
  'Enter a valid transaction date.': 'validation.validTransactionDate',
  'Enter a valid transaction time.': 'validation.validTime',
  'Choose valid source and destination wallets for the transfer.': 'validation.validSource',
  'Insufficient balance in source wallet.': 'validation.insufficientBalance',
  'Choose a valid source and destination wallet for the transfer.': 'validation.validSource',
  'Transfer source and destination must be different wallets.': 'validation.differentWallets',
  'Choose a valid wallet.': 'validation.chooseWallet',
  'Choose a valid category.': 'validation.chooseCategory',
  'Choose a category that matches the transaction type.': 'validation.chooseCategory',
  'A transaction with this ID already exists.': 'validation.transactionExists',
  'This transaction no longer exists.': 'validation.transactionMissing',
  'A wallet with this ID already exists.': 'validation.walletExists',
  'This wallet no longer exists.': 'validation.walletMissing',
  'A category with this ID already exists.': 'validation.categoryExists',
  'This category no longer exists.': 'validation.categoryMissing',
  'A category used by transactions cannot change its type.': 'validation.categoryTypeInUse',
  'Enter a valid check-in date.': 'validation.validCheckInDate',
  'Enter a budget name.': 'validation.budgetName',
  'Budget amount must be a positive whole number of VND.': 'validation.budgetAmount',
  'Choose a valid expense category for this budget.': 'validation.budgetCategory',
  'Choose valid budget dates.': 'validation.validBudgetDate',
  'Budget end date must be on or after its start date.': 'validation.budgetDateOrder',
  'Enter a goal name.': 'validation.goalName',
  'Goal target must be a positive whole number of VND.': 'validation.goalTarget',
  'Enter a valid goal deadline.': 'validation.goalDeadline',
  'Contribution must be a non-negative whole number of VND.': 'validation.contributionAmount',
  'Choose a valid savings goal.': 'validation.goalMissing',
  'Enter a valid contribution date.': 'validation.validContributionDate',
  'Choose a valid check-in date.': 'validation.validCheckInDate',
  'This budget no longer exists.': 'validation.budgetMissing',
  'A budget with this ID already exists.': 'validation.budgetExists',
  'This goal no longer exists.': 'validation.goalMissing',
  'A goal with this ID already exists.': 'validation.goalExists',
  'This contribution no longer exists.': 'validation.contributionMissing',
  'A contribution with this ID already exists.': 'validation.contributionExists',
};

export const translateFinanceError = (
  error: unknown,
  t: (key: TranslationKey, params?: TranslationParams) => string,
  fallback: TranslationKey,
) => {
  if (!(error instanceof Error)) {
    return t(fallback);
  }
  const key = walletErrorKeys[error.message];
  if (!key) {
    console.error('Finance action failed.', error);
    return t(fallback);
  }
  return t(key);
};

const authErrorKeys: Record<string, TranslationKey> = {
  'not-configured': 'auth.errorNotConfigured',
  'invalid-credentials': 'auth.errorInvalidCredentials',
  'email-not-confirmed': 'auth.errorEmailNotConfirmed',
  'email-exists': 'auth.errorEmailExists',
  'weak-password': 'auth.errorWeakPassword',
  network: 'auth.errorNetwork',
  'session-expired': 'auth.sessionExpired',
  unknown: 'auth.errorUnknown',
};

export const translateAuthError = (
  code: string | null,
  t: (key: TranslationKey, params?: TranslationParams) => string,
) => {
  if (!code) {
    return '';
  }
  return t(authErrorKeys[code] ?? 'auth.errorUnknown');
};
