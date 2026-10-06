export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);

export const formatVndInput = (value: number, language: 'vi' | 'en' = 'vi') =>
  new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(value);

export const parseVndInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return 0;
  }

  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? amount : null;
};

export const formatCompactCurrency = (value: number) =>
  new Intl.NumberFormat('vi-VN', {
    notation: 'compact',
    maximumFractionDigits: 1,
    currency: 'VND',
    style: 'currency',
  }).format(value);
