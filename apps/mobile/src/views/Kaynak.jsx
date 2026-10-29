// Tahmin kaynağı (29 Ekim 2026, Ali Kemal: "B'yi tüm sayfalarda kullanalım, günlük dahil"): dört tahmin sayfasının
// üstünde aynı çubuk (renkli noktalar + "Ortak tahmin · N modelin ortancası ve uyumu" ya da tek model). Dokununca
// alttan sekmeli pencere açılır:
//   Ortak tahmin — 7 model kutucuklu; en az 2 model; "Önerilen 5'e dön"; değişiklik "Uygula" ile işlenir (her
//                  dokunuşta sayfa yeniden hesaplanmasın diye).
//   Tek model    — yuvarlak seçim; dokununca hemen geçer (uyum işaretleri gizlenir).
// Eski üstteki model çiplerinin yerini aldı. Seçim tüm sayfalarda ortaktır (prefs.selected).

import { useState } from "react";

const REGION = {
  ecmwf_ifs: "Avrupa",
  gfs_seamless: "ABD",
  icon_seamless: "Almanya",
  ukmo_seamless: "Birleşik Krallık",
  meteofrance_seamless: "Fransa",
  gem_seamless: "Kanada",
  jma_gsm: "Japonya",
};

const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

export function SrcBar({ models, single, onOpen }) {
  return (
    <button type="button" className="gsrc" aria-label="Tahmin kaynağını seç" onClick={onOpen}>
      <span className="dots">
        {models.map((m) => (
          <i key={m.id} style={{ background: m.color }} />
        ))}
      </span>
      <span className="gsrc-t">
        <b>{single ? models[0]?.label : "Ortak tahmin"}</b>
        <small>{single ? "tek model · uyum yok" : `${models.length} modelin ortancası ve uyumu`}</small>
      </span>
      <svg className="chev" viewBox="0 0 24 24">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

const Check = ({ on }) => (
  <span className={"cb" + (on ? " on" : "")}>
    {on && (
      <svg viewBox="0 0 12 12">
        <path d="M2.4 6.4 L5 9 L9.6 3.4" />
      </svg>
    )}
  </span>
);
const Radio = ({ on }) => <span className={"rd" + (on ? " on" : "")} />;

export function SrcSheet({ all, selected, recommended, onApply, onClose }) {
  const multi = selected.length > 1;
  const [tab, setTab] = useState(multi ? "ortak" : "tek");
  const [draft, setDraft] = useState(multi ? selected : recommended);
  const [warn, setWarn] = useState(false);

  const toggle = (id) => {
    const on = draft.includes(id);
    if (on && draft.length <= 2) return setWarn(true);
    setWarn(false);
    setDraft(on ? draft.filter((x) => x !== id) : all.map((m) => m.id).filter((x) => x === id || draft.includes(x)));
  };
  const ordered = () => all.map((m) => m.id).filter((x) => draft.includes(x));

  return (
    <div className="sheet" role="dialog" aria-label="Tahmin kaynağı">
      <div className="sh-back" onClick={onClose} />
      <div className="sh-card">
        <div className="sh-grip" />
        <div className="sh-head">
          <b>Tahmin kaynağı</b>
          <button type="button" aria-label="Kapat" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="sh-body src">
          <div className="segm" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "ortak"} onClick={() => setTab("ortak")}>
              Ortak tahmin
            </button>
            <button type="button" role="tab" aria-selected={tab === "tek"} onClick={() => setTab("tek")}>
              Tek model
            </button>
          </div>

          {tab === "ortak" ? (
            <>
              <div className="sh-sec">ORTAK TAHMİNE GİRECEK MODELLER</div>
              {all.map((m) => {
                const on = draft.includes(m.id);
                return (
                  <button key={m.id} type="button" className="srow ck" role="checkbox" aria-checked={on} onClick={() => toggle(m.id)}>
                    <span className="dots">
                      <i style={{ background: m.color }} />
                    </span>
                    <span>
                      <b>{m.label}</b>
                      <small>{REGION[m.id] || ""}</small>
                    </span>
                    <Check on={on} />
                  </button>
                );
              })}
              {warn && <p className="sh-warn">Ortak tahmin için en az 2 model gerekir. Tek bir model için üstten Tek model'i seç.</p>}
              <div className="sh-foot">
                <span>{draft.length} seçili · en az 2</span>
                {!same(draft, recommended) && (
                  <button
                    type="button"
                    onClick={() => {
                      setWarn(false);
                      setDraft(recommended);
                    }}
                  >
                    Önerilen {recommended.length}'e dön
                  </button>
                )}
              </div>
              <button type="button" className="apply" onClick={() => onApply(ordered())}>
                Uygula
              </button>
            </>
          ) : (
            <>
              <div className="sh-sec">TEK MODEL · uyum işaretleri gizlenir</div>
              {all.map((m) => {
                const on = !multi && selected[0] === m.id;
                return (
                  <button key={m.id} type="button" className={"srow" + (on ? " on" : "")} onClick={() => onApply([m.id])}>
                    <span className="dots">
                      <i style={{ background: m.color }} />
                    </span>
                    <span>
                      <b>{m.label}</b>
                      <small>{REGION[m.id] || ""}</small>
                    </span>
                    <Radio on={on} />
                  </button>
                );
              })}
              <p className="sh-note">Tek modelde Modeller ve Grafikler sayfaları kapalıdır; karşılaştırma için Ortak tahmin'e dön.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
