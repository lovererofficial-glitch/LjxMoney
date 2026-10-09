import Svg, { Path } from 'react-native-svg';
import { useI18n } from '../i18n';
import { colors } from '../theme/theme';

interface StreakFlameProps {
  size?: number;
  color: string;
}

export function StreakFlame({ size = 24, color }: StreakFlameProps) {
  const { t } = useI18n();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 32" fill="none" accessibilityLabel={t('streak.title')}>
      <Path
        d="M13.27 1.5c.8 5.37-.44 8.04-2.57 10.29-.33-1.77-1.3-3.55-2.67-4.67-.04 4.04-4.25 7.6-4.25 13.12 0 6.03 4.44 10.26 9.67 10.26s9.67-4.23 9.67-10.26c0-6.48-4.91-10.08-6.82-14.22-.81-1.76-1.47-3.17-3.03-4.52Z"
        fill={color}
      />
      <Path
        d="M12.08 27.83c-2.23 0-3.86-1.56-3.86-3.86 0-1.67.88-3.08 2.14-4.58.2 1.3.86 2.1 1.62 2.54 1.3-1.33 2.02-2.93 2.11-4.6 1.2 1.36 1.95 3.13 1.95 5.08 0 3.23-1.64 5.42-3.96 5.42Z"
        fill={colors.background}
        fillOpacity={0.62}
      />
    </Svg>
  );
}