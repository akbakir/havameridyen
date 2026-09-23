import { Html, Head, Main, NextScript } from "next/document";

// lang="tr": CSS text-transform: uppercase Türkçe kurallarıyla çalışsın (i → İ, ı → I).
// Olmadığında "hemfikir" → "HEMFIKIR" gibi noktasız büyük I çıkıyordu. Ekran okuyucular
// ve arama motorları için de sayfanın dili Türkçe olarak bildirilir.
export default function Document() {
  return (
    <Html lang="tr">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
