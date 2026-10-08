import type { TranslationKey, TranslationParams } from './translate.ts';

const walletTranslationKeys: Record<string, { key: TranslationKey; defaultName: string }> = {
  cash: { key: 'wallet.cash', defaultName: 'Cash' },
  bank: { key: 'wallet.bank', defaultName: 'Bank' },
  momo: { key: 'wallet.momo', defaultName: 'MoMo' },
};

export const localizeWalletName = (
  id: string,
  name: string,
  t: (key: TranslationKey, params?: TranslationParams) => string,
) => {
  const localization = walletTranslationKeys[id];
  return localization && name === localization.defaultName ? t(localization.key) : name;
};