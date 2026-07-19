import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Harmony Store Oficial — Gestão de Produção",
  description: "Sistema oficial de solicitações, estoque e entrega de matérias-primas da Harmony Store.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
