export type PrimitiveAnswer = string | number | boolean;
export type Answer = PrimitiveAnswer | PrimitiveAnswer[];
export type Answers = Record<string, Answer | undefined>;

export type Condition = { answer: string; equals?: PrimitiveAnswer; includes?: PrimitiveAnswer; exists?: boolean };
type StepBase = { id: string; title: string; body?: string; when?: Condition; cta?: string };
type Choice = { value: string; label: string; detail?: string };

/** A remote image or animated GIF. Keep media optional so an app never depends on it. */
export type InfoStep = StepBase & { type: 'info'; image?: { uri: string; accessibilityLabel?: string } };
export type SelectStep = StepBase & { type: 'select'; answerKey: string; options: readonly Choice[]; multiple?: boolean };
export type TextStep = StepBase & { type: 'text'; answerKey: string; placeholder?: string; keyboard?: 'default' | 'numeric'; optional?: boolean };
export type SliderStep = StepBase & { type: 'slider'; answerKey: string; minimum: number; maximum: number; initial: number; unit?: string };
export type PermissionStep = StepBase & { type: 'permission'; permission: 'notifications' | 'tracking'; allowLabel?: string; skipLabel?: string };
export type LoadingStep = StepBase & { type: 'loading'; durationMs?: number };
export type TestimonialStep = StepBase & { type: 'testimonial'; quote: string; author: string };
export type PaywallStep = StepBase & { type: 'paywall' };
export type OnboardingStep = InfoStep | SelectStep | TextStep | SliderStep | PermissionStep | LoadingStep | TestimonialStep | PaywallStep;

export type AppDefinition = {
  /** Stable per-app key. It namespaces rows when multiple apps share Supabase. */
  id: string;
  name: string;
  onboardingVersion: number;
  brand: { primary: `#${string}`; appearance: 'system' | 'light' | 'dark' };
  links: { privacy: string; terms: string; support: string };
  subscription: { entitlementId: string; offeringPlacement: string };
  reminders: { enabled: boolean; hour: number; minute: number; title: string; body: string };
  onboarding: readonly OnboardingStep[];
};
