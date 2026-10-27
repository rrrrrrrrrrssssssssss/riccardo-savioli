import type { Metadata } from "next";
import localFont from "next/font/local";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const unica = localFont({
  src: [
    { path: "../Font/Unica77LL-Regular.woff2", weight: "400", style: "normal" },
    { path: "../Font/Unica77LL-RegularItalic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-unica",
});

const description =
  "Riccardo Savioli is a graphic designer based between Milan and Ferrara, working mainly on visual identities, typography and editorial design.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Riccardo Savioli",
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Riccardo Savioli",
    title: "Riccardo Savioli",
    description,
    locale: "en",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={unica.variable}>
      <body>{children}</body>
    </html>
  );
}
