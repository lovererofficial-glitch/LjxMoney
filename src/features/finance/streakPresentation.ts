import { streakColors } from '../../theme/theme.ts';

export type StreakTier = keyof typeof streakColors;

export const getStreakTier = (streak: number): StreakTier => {
  if (!Number.isFinite(streak) || streak < 3) {
    return 'gray';
  }
  if (streak < 10) {
    return 'lightOrange';
  }
  if (streak < 30) {
    return 'darkOrange';
  }
  if (streak < 100) {
    return 'lightRed';
  }
  if (streak < 200) {
    return 'darkRed';
  }
  if (streak < 500) {
    return 'blue';
  }
  return 'darkGreen';
};

export const getStreakColor = (streak: number): string => streakColors[getStreakTier(streak)];