import "../styles/globals.css";

// Yazı tipleri (Google Fonts) pages/_document.js'te: next/head içinde stil dosyası Next.js'in uyarısıydı
// ("Do not add stylesheets using next/head"); _document tüm sayfalarda bir kez, sunucu HTML'inde yükler.
export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
