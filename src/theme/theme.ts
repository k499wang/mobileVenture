import { useColorScheme } from 'react-native';

/**
 * THE style file. Every shared component reads from here, so restyling an app
 * means editing only this file. Keep feature screens on these tokens too.
 */
const brand = '#__BRAND_COLOR__';

export const theme = {
  /** 'system' follows the device; 'light' or 'dark' locks the app. */
  appearance: 'system' as 'system' | 'light' | 'dark',
  brand,
  /** Text/icon color placed on top of `brand` (buttons, selected chips). */
  onBrand: '#FFFFFF',
  colors: {
    light: {
      page: '#F7F7FB', surface: '#FFFFFF', surfaceMuted: '#EDEDF4',
      text: '#19191F', muted: '#686875', line: '#D9D9E2',
      danger: '#B42318', success: '#16A34A',
    },
    dark: {
      page: '#111116', surface: '#24242B', surfaceMuted: '#2D2D37',
      text: '#F7F7FB', muted: '#B5B5C2', line: '#FFFFFF2B',
      danger: '#F04438', success: '#32D583',
    },
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
  radius: { sm: 12, md: 18, lg: 24, pill: 999 },
  /** undefined = system font. Load custom fonts with expo-font, then name them here. */
  fonts: { regular: undefined as string | undefined, bold: undefined as string | undefined },
  text: {
    display: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8, lineHeight: 40 },
    title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.6, lineHeight: 36 },
    heading: { fontSize: 19, fontWeight: '700', lineHeight: 24 },
    body: { fontSize: 16, fontWeight: '400', lineHeight: 23 },
    label: { fontSize: 16, fontWeight: '700', lineHeight: 20 },
    caption: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  },
  button: { height: 54, radius: 18 },
  /** false = solid surfaces everywhere (Liquid Glass/blur off). */
  glass: true,
  motion: { stepTransitionMs: 220 },
} as const;

export type TextVariant = keyof typeof theme.text;
export type ThemeColors = { [K in keyof typeof theme.colors.light]: string };

export function useTheme() {
  const scheme = useColorScheme();
  const dark = theme.appearance === 'dark' || (theme.appearance === 'system' && scheme === 'dark');
  const colors: ThemeColors = dark ? theme.colors.dark : theme.colors.light;
  return { ...theme, dark, colors };
}
export type Theme = ReturnType<typeof useTheme>;
