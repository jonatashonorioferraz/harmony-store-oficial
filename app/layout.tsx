import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata={title:"Fluxo — Assistente Financeiro Inteligente",description:"Envie documentos. A IA organiza seu financeiro."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
