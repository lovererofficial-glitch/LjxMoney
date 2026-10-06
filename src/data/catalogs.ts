import type { Category, Wallet } from '../features/finance/models';

export const defaultWallets: Wallet[] = [
  {
    id: 'cash',
    name: 'Cash',
    color: '#68E1FD',
    type: 'cash',
    icon: 'wallet',
    initialBalance: 0,
    archivedAt: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'bank',
    name: 'Bank',
    color: '#3DD598',
    type: 'bank',
    icon: 'landmark',
    initialBalance: 0,
    archivedAt: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 'momo',
    name: 'MoMo',
    color: '#C084FC',
    type: 'ewallet',
    icon: 'smartphone',
    initialBalance: 0,
    archivedAt: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
];

export const legacyWallets: Wallet[] = [
  { id: 'card', name: 'Card', color: '#FFB454', type: 'card', icon: 'creditcard', initialBalance: 0 },
];

export const defaultCategories: Category[] = [
  { id: 'food', name: 'Ăn uống', color: '#FFB454', type: 'expense', icon: 'utensils', archivedAt: null },
  { id: 'coffee', name: 'Cà phê', color: '#D9A066', type: 'expense', icon: 'coffee', archivedAt: null },
  { id: 'transport', name: 'Di chuyển', color: '#68E1FD', type: 'expense', icon: 'car', archivedAt: null },
  { id: 'entertainment', name: 'Giải trí', color: '#A78BFA', type: 'expense', icon: 'film', archivedAt: null },
  { id: 'shopping', name: 'Mua sắm', color: '#F472B6', type: 'expense', icon: 'shopping-bag', archivedAt: null },
  { id: 'housing', name: 'Nhà ở', color: '#FF6B6B', type: 'expense', icon: 'home', archivedAt: null },
  { id: 'health', name: 'Sức khỏe', color: '#34D399', type: 'expense', icon: 'heart-pulse', archivedAt: null },
  { id: 'education', name: 'Học tập', color: '#60A5FA', type: 'expense', icon: 'book', archivedAt: null },
  { id: 'personal', name: 'Cá nhân', color: '#F9A8D4', type: 'expense', icon: 'sparkles', archivedAt: null },
  { id: 'gift', name: 'Quà tặng', color: '#FCD34D', type: 'expense', icon: 'gift', archivedAt: null },
  { id: 'other-expense', name: 'Khác', color: '#8EA0B9', type: 'expense', icon: 'dots-horizontal', archivedAt: null },
  { id: 'salary', name: 'Lương', color: '#3DD598', type: 'income', icon: 'currency-usd', archivedAt: null },
  { id: 'freelance', name: 'Freelance', color: '#68E1FD', type: 'income', icon: 'briefcase', archivedAt: null },
  { id: 'bonus', name: 'Thưởng', color: '#F472B6', type: 'income', icon: 'star', archivedAt: null },
  { id: 'other-income', name: 'Khác', color: '#A78BFA', type: 'income', icon: 'cash', archivedAt: null },
];

export const legacyCategories: Category[] = [
  { id: 'old-other-expense', name: 'Khác', color: '#8EA0B9', type: 'expense', icon: 'dots-horizontal', archivedAt: null },
];
