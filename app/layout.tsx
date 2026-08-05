import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Harmony Studio — Anúncios com IA",
  description: "Crie materiais profissionais para seus anúncios em poucos minutos, com revisão inteligente e fidelidade ao produto real.",
  openGraph: {
    title: "Harmony Studio — Anúncios com IA",
    description: "Fotos reais. Material profissional.",
    images: [{ url: "/og.png", width: 1536, height: 1024 }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
