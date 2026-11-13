import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Evolve — Coach de développement personnel IA',
  description: "Votre coach IA qui vous connaît vraiment : entretien approfondi, rapport de compétences, limites et plan d'action 30/60/90 jours. Votre compte est obligatoire, votre CV est optionnel.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23103b2a'/%3E%3Ctext x='16' y='23' font-size='18' text-anchor='middle' fill='%23c6a04e' font-family='Georgia' font-style='italic'%3EE%3C/text%3E%3C/svg%3E" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
