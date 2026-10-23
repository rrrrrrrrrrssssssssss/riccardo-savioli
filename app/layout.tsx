import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const unica = localFont({
  src: [
    { path: "../Font/Unica77LL-Regular.otf", weight: "400", style: "normal" },
    { path: "../Font/Unica77LL-RegularItalic.otf", weight: "400", style: "italic" },
  ],
  variable: "--font-unica",
});

export const metadata: Metadata = {
  title: "Riccardo Savioli",
  description:
    "Riccardo Savioli is a graphic designer based between Milan and Ferrara, working mainly on visual identities, typography and editorial design.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={unica.variable}>
      <body>{children}</body>
    </html>
  );
}
