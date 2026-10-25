import { Html, Head, Main, NextScript } from "next/document";

// lang="tr": CSS text-transform: uppercase Türkçe kurallarıyla çalışsın (i → İ, ı → I).
// Olmadığında "hemfikir" → "HEMFIKIR" gibi noktasız büyük I çıkıyordu. Ekran okuyucular
// ve arama motorları için de sayfanın dili Türkçe olarak bildirilir.
export default function Document() {
  return (
    <Html lang="tr">
      <Head>
        {/* Yazı tipleri: Space Grotesk (başlıklar), IBM Plex Sans (metin), IBM Plex Mono (sayılar) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
