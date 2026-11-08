// SSS 10 ve 11 (8 Kas 2026): yağış / kar şiddeti — içerik lib/intensityFaq.js'ten (mobil ile ortak). Bloklar burada
// sitenin SSS biçimiyle çizilir; ikonlar lib/wxicons.js, grafikler SVG.

import { ICON_COLS, ICON_ROWS, boundsSvg, curveSvg } from "../lib/intensityFaq";
import { WxIcon } from "./WeatherCond";

const TH = { textAlign: "left", fontWeight: 600, color: "var(--ink)", padding: "6px 10px 6px 0", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" };
const TD = { padding: "6px 10px 6px 0", borderBottom: "1px solid var(--line)", verticalAlign: "top" };
const P = { margin: "0 0 12px" };
const H = { margin: "16px 0 8px", fontSize: 14, fontWeight: 600, color: "var(--ink)" };

// <b>…</b> parçalarını kalın yazar
const rich = (text) => String(text).split(/<b>(.*?)<\/b>/).map((part, k) => (k % 2 ? <b key={k}>{part}</b> : part));
const SVG = { curve: curveSvg, bounds: boundsSvg };

function Icons() {
  return (
    <div style={{ overflowX: "auto", margin: "0 0 12px" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, minWidth: 520 }}>
        <thead>
          <tr>
            <th style={TH}>Tür</th>
            {ICON_COLS.map((c) => (
              <th key={c} style={{ ...TH, textAlign: "center" }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ICON_ROWS.map(([name, cells]) => (
            <tr key={name}>
              <td style={{ ...TD, fontWeight: 600, color: "var(--ink)" }}>{name}</td>
              {cells.map(([ic, t], k) => (
                <td key={k} style={{ ...TD, textAlign: "center" }}>
                  <WxIcon ic={ic} size={34} />
                  <div style={{ fontSize: 11, lineHeight: 1.3, color: t === "aynı" ? "var(--ink-soft)" : undefined }}>{t}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function IntensityFaq({ blocks }) {
  return blocks.map((b, i) => {
    if (b.t === "p")
      return (
        <p key={i} style={P}>
          {rich(b.text)}
        </p>
      );
    if (b.t === "h")
      return (
        <h3 key={i} style={H}>
          {b.text}
        </h3>
      );
    if (b.t === "ul")
      return (
        <ul key={i} style={{ margin: "0 0 12px", paddingLeft: 20 }}>
          {b.items.map((x, k) => (
            <li key={k} style={{ marginBottom: 4 }}>
              {rich(x)}
            </li>
          ))}
        </ul>
      );
    if (b.t === "table")
      return (
        <div key={i} style={{ overflowX: "auto", margin: "0 0 12px" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                {b.head.map((h) => (
                  <th key={h} style={TH}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, k) => (
                <tr key={k}>
                  {r.map((c, j) => (
                    <td key={j} style={{ ...TD, ...(j === 0 ? { fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" } : { whiteSpace: "nowrap" }) }}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    if (b.t === "icons") return <Icons key={i} />;
    if (b.t === "svg")
      return (
        <figure key={i} style={{ margin: "4px 0 14px" }}>
          <div style={{ color: "var(--ink)" }} dangerouslySetInnerHTML={{ __html: SVG[b.which]() }} />
          <figcaption style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>{b.caption}</figcaption>
        </figure>
      );
    if (b.t === "refs")
      return (
        <div key={i} style={{ fontSize: 12.5 }}>
          <h3 style={H}>Kaynaklar</h3>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {b.items.map((r) => (
              <li key={r.url} style={{ marginBottom: 3 }}>
                <a href={r.url} target="_blank" rel="noopener noreferrer">
                  {r.text}
                </a>
              </li>
            ))}
          </ol>
        </div>
      );
    return null;
  });
}
