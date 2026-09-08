// Legal & compliance page content for Level Up Trading Hub.
// NOTE: These are PLACEHOLDER drafts only. Replace `body` with the official
// copy for each policy — the app is already wired to render whatever text
// lives here, so updating this file is the only step needed.

export type LegalDoc = {
  slug: string;
  title: string;
  icon: string;
  body: string[];
};

const PLACEHOLDER = (name: string) => [
  `This is placeholder text for the ${name}. The official policy copy has not been added yet.`,
  "Level Up Trading Hub will replace this section with the full, final legal text before this policy is relied upon by members.",
];

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "terms",
    title: "Terms of Service",
    icon: "document-text-outline",
    body: PLACEHOLDER("Terms of Service"),
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    icon: "shield-checkmark-outline",
    body: PLACEHOLDER("Privacy Policy"),
  },
  {
    slug: "community-guidelines",
    title: "Community Guidelines",
    icon: "people-outline",
    body: PLACEHOLDER("Community Guidelines"),
  },
  {
    slug: "trading-disclaimer",
    title: "Trading & Financial Disclaimer",
    icon: "bar-chart-outline",
    body: PLACEHOLDER("Trading & Financial Disclaimer"),
  },
  {
    slug: "mingle-safety",
    title: "Single & Mingle Safety Guidelines",
    icon: "heart-circle-outline",
    body: PLACEHOLDER("Single & Mingle Safety Guidelines"),
  },
  {
    slug: "premium-policy",
    title: "Premium Subscription, Cancellation & Refund Policy",
    icon: "diamond-outline",
    body: PLACEHOLDER("Premium Subscription, Cancellation & Refund Policy"),
  },
  {
    slug: "affiliate-disclosure",
    title: "Affiliate Disclosure",
    icon: "link-outline",
    body: PLACEHOLDER("Affiliate Disclosure"),
  },
  {
    slug: "dmca",
    title: "Copyright & DMCA Policy",
    icon: "ribbon-outline",
    body: PLACEHOLDER("Copyright & DMCA Policy"),
  },
  {
    slug: "account-deletion",
    title: "Account & Data Deletion Policy",
    icon: "trash-outline",
    body: PLACEHOLDER("Account & Data Deletion Policy"),
  },
];

export function getLegalDoc(slug: string | undefined | null): LegalDoc | undefined {
  return LEGAL_DOCS.find((d) => d.slug === slug);
}
