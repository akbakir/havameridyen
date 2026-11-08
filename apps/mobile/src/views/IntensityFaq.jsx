// SSS — yağış / kar şiddeti (8 Kas 2026): içerik lib/intensityFaq.js'ten (web /sss ile ortak). Bloklar alttan açılan
// sayfanın biçimiyle çizilir; ikonlar lib/wxicons.js, grafikler SVG. Tablolar yatay kaydırılır.
import { ICON_COLS, ICON_ROWS, boundsSvg, curveSvg } from "@lib/intensityFaq";
import { wxSvg } from "@lib/wxicons";

const rich = (text) => String(text).split(/<b>(.*?)<\/b>/).map((part, k) => (k % 2 ? <b key={k}>{part}</b> : part));
const SVG = { curve: curveSvg, bounds: boundsSvg };

function Icons() {
  return (
    <div className="fq-scroll">
      <table className="fq-t fq-ic">
        <thead>
          <tr>
            <th>Tür</th>
            {ICON_COLS.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ICON_ROWS.map(([name, cells]) => (
            <tr key={name}>
              <th>{name}</th>
              {cells.map(([ic, t], k) => (
                <td key={k}>
                  <span className="fq-wx" dangerouslySetInnerHTML={{ __html: wxSvg(ic) }} />
                  <small className={t === "aynı" ? "fq-same" : undefined}>{t}</small>
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
    if (b.t === "p") return <p key={i}>{rich(b.text)}</p>;
    if (b.t === "h")
      return (
        <h5 key={i} className="fq-h">
          {b.text}
        </h5>
      );
    if (b.t === "ul")
      return (
        <ul key={i} className="fq-ul">
          {b.items.map((x, k) => (
            <li key={k}>{rich(x)}</li>
          ))}
        </ul>
      );
    if (b.t === "table")
      return (
        <div key={i} className="fq-scroll">
          <table className="fq-t">
            <thead>
              <tr>
                {b.head.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, k) => (
                <tr key={k}>
                  {r.map((c, j) => (j === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    if (b.t === "icons") return <Icons key={i} />;
    if (b.t === "svg")
      return (
        <figure key={i} className="fq-fig">
          <div dangerouslySetInnerHTML={{ __html: SVG[b.which]() }} />
          <figcaption>{b.caption}</figcaption>
        </figure>
      );
    if (b.t === "refs")
      return (
        <div key={i} className="fq-refs">
          <h5 className="fq-h">Kaynaklar</h5>
          <ol>
            {b.items.map((r) => (
              <li key={r.url}>
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
