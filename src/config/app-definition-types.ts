import type { SFSymbol } from 'expo-symbols';

export type PrimitiveAnswer = string | number | boolean;
export type Answer = PrimitiveAnswer | PrimitiveAnswer[];
export type Answers = Record<string, Answer | undefined>;

/** Plain text or a key from src/i18n/en.ts. Text may use {{answers.key}}. */
export type Copy = string;

export type Condition = { answer: string; equals?: PrimitiveAnswer; includes?: PrimitiveAnswer; exists?: boolean };
type StepBase = { id: string; title: Copy; body?: Copy; when?: Condition; cta?: Copy };
type Choice = { value: string; label: Copy; detail?: Copy };

/** A remote image or animated GIF. Keep media optional so an app never depends on it. */
export type InfoStep = StepBase & { type: 'info'; image?: { uri: string; accessibilityLabel?: string } };
export type SelectStep = StepBase & { type: 'select'; answerKey: string; options: readonly Choice[]; multiple?: boolean };
export type TextStep = StepBase & { type: 'text'; answerKey: string; placeholder?: Copy; keyboard?: 'default' | 'numeric'; optional?: boolean };
export type SliderStep = StepBase & { type: 'slider'; answerKey: string; minimum: number; maximum: number; initial: number; unit?: string };
/** Saves an ISO string. `mode: 'time'` saves today's date with the chosen time. */
export type DateStep = StepBase & { type: 'date'; answerKey: string; mode?: 'date' | 'time'; optional?: boolean };
export type PermissionStep = StepBase & { type: 'permission'; permission: 'notifications' | 'tracking'; allowLabel?: Copy; skipLabel?: Copy };
export type LoadingStep = StepBase & { type: 'loading'; durationMs?: number };
export type TestimonialStep = StepBase & { type: 'testimonial'; quote: Copy; author: string };
/** Asks iOS for the native review prompt (iOS decides whether it appears), then continues. */
export type RatingStep = StepBase & { type: 'rating'; skipLabel?: Copy };
/** "Your plan is ready" growth chart. `values` are relative bar heights (0–1), left to right. */
export type ChartStep = StepBase & { type: 'chart'; values?: readonly number[]; startLabel?: Copy; endLabel?: Copy };
/** Remote mp4/HLS. Plays muted and looped by default. */
export type VideoStep = StepBase & { type: 'video'; uri: string; loop?: boolean; muted?: boolean };
/** Opens the RevenueCat paywall. Dismissing continues (soft paywall). */
export type PaywallStep = StepBase & { type: 'paywall' };

export type OnboardingStep = InfoStep | SelectStep | TextStep | SliderStep | DateStep | PermissionStep | LoadingStep | TestimonialStep | RatingStep | ChartStep | VideoStep | PaywallStep;
export type OnboardingStepType = OnboardingStep['type'];

export type TabDefinition = {
  /** Route file name inside src/app/(tabs)/, e.g. 'index' or 'settings'. */
  name: string;
  title: Copy;
  icon: { default: SFSymbol; selected: SFSymbol };
};

export type AppDefinition = {
  /** Stable per-app key. It namespaces rows when multiple apps share Supabase. */
  id: string;
  name: string;
  onboardingVersion: number;
  links: { privacy: string; terms: string; supportEmail: string };
  /** Numeric App Store ID, used for Rate and Share. Empty until the app exists in App Store Connect. */
  appStoreId: string;
  /** `required: true` shows Apple/Google sign-in after onboarding (and the paywall). */
  auth: { required: boolean };
  subscription: { entitlementId: string; offeringPlacement: string };
  reminders: { enabled: boolean; hour: number; minute: number; title: Copy; body: Copy };
  tabs: readonly TabDefinition[];
  onboarding: readonly OnboardingStep[];
};
