import "./globals.css";

export const metadata = {
  title: "PRISM — Agency Insights Platform",
  description: "Agency Intelligence Platform — insights powered by live data",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
