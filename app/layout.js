import "./globals.css";

/**
 * Root metadata — drives both the <title>/description fallback for every
 * route AND the Open Graph + Twitter card preview when someone shares the
 * URL on WhatsApp, LinkedIn, Slack, X, etc. The marketing landing page
 * (app/page.js) inherits these defaults; individual routes can override
 * via their own `export const metadata`.
 *
 * Positioning string is the locked PRISM Council hook so every share looks
 * sales-ready out of the box.
 */
export const metadata = {
  metadataBase: new URL('https://prism-fluo.vercel.app'),
  title: {
    default: "PRISM Council — The brain of a senior strategist, the speed of an intern",
    template: "%s · PRISM Council",
  },
  description:
    "PRISM Council reads your GWI, Comscore, SimilarWeb and Konnect Insights — then writes the brief using your team's frameworks, verified by 7 AI agents before you see it. Built for agency strategists.",
  keywords: [
    'agency strategy', 'brand strategy AI', 'GWI insights', 'Konnect Insights',
    'SimilarWeb analysis', 'Comscore reports', 'keyword strategy',
    'insight automation', 'pitch deck AI', 'Lowe Lintas', 'India agency tools',
  ],
  authors: [{ name: 'Fluo Digital' }],
  creator: 'Fluo Digital',
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://prism-fluo.vercel.app',
    siteName: 'PRISM Council',
    title: 'PRISM Council — The brain of a senior strategist, the speed of an intern',
    description:
      "Reads your GWI, Comscore, SimilarWeb and Konnect Insights. Writes the brief using your team's frameworks. Verified by 7 AI agents before you see it.",
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PRISM Council — The intelligence layer for strategic briefs',
    description:
      'AI that follows your team\'s strategic frameworks. Verified by 7 agents. Used by strategists at Lowe Lintas.',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
