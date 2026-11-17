// Үе 4 — энгийн, хүртээмжтэй баганан график (SVG, гадаад сангүй).
// Нэг цуваа (гарчиг нь нэрлэнэ, legend шаардлагагүй); тэг суурьтай нэг тэнхлэг; нимгэн тор;
// багана бүр гараар сонгогдох (Tab) + aria-label; hover/focus tooltip; хүснэгт хувилбар (details).
import { useState } from 'react';

/** “Цэвэр” дээд утга ба алхам: тоо хэмжээнд бүхэл алхам (0.5 гэх мэт бутархай тэмдэглэгээгүй) */
import { t } from '../i18n.js';
function scale(maxValue, integer) {
  const v = Math.max(maxValue, integer ? 4 : 0);
  if (v <= 0)
    return {
      max: 1,
      step: 0.25,
    };
  const raw = v / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  let step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  if (integer) step = Math.max(1, Math.ceil(step));
  return {
    max: step * 4,
    step,
  };
}

/**
 * data: [{ label, short?, value (null = өгөгдөлгүй) }]. `integer` — тоо хэмжээ (бүхэл тэнхлэг).
 * viewBox-ийн өргөнийг картын бодит өргөнд ойр (≈420) байлгаж, текст жижгэрэхгүй.
 */
export function BarChart({ data, title, unit = '', format = (v) => String(v), height = 220, integer = false }) {
  const [tip, setTip] = useState(null);
  const W = 420;
  const M = {
    top: 12,
    right: 6,
    bottom: 28,
    left: 36,
  };
  const iw = W - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const hasData = data.some((d) => d.value !== null && d.value !== undefined && d.value > 0);
  const { max, step } = scale(Math.max(0, ...data.map((d) => d.value ?? 0)), integer);
  const ticks = [0, 1, 2, 3, 4].map((i) => i * step);
  const band = iw / Math.max(1, data.length);
  const bw = Math.max(4, Math.min(28, band * 0.62));
  const every = Math.ceil(data.length / 6); // шошго давхцахгүй (≈6 шошго)
  const y = (v) => M.top + ih - (v / max) * ih;
  if (!hasData) {
    return (
      <figure className="chart-figure">
        <figcaption className="small muted">{title}</figcaption>
        <p className="muted chart-empty">{t('Энэ хугацаанд өгөгдөл алга.')}</p>
      </figure>
    );
  }
  return (
    <figure className="chart-figure">
      <figcaption className="small muted">{title}</figcaption>
      <div className="chart-wrap">
        <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title}>
          <g className="grid">
            {ticks.map((tv) => (
              <g key={tv}>
                <line x1={M.left} x2={W - M.right} y1={y(tv)} y2={y(tv)} />
                <text x={M.left - 6} y={y(tv) + 4} textAnchor="end">
                  {format(tv)}
                </text>
              </g>
            ))}
          </g>
          {data.map((d, i) => {
            const cx = M.left + band * i + band / 2;
            if (d.value === null || d.value === undefined) return null;
            const h = Math.max(0, (d.value / max) * ih);
            const x = cx - bw / 2;
            const top = M.top + ih - h;
            const r = Math.min(4, h, bw / 2);
            // Дээд талдаа 4px бөөрөнхий, суурьтайгаа шулуун
            const path = `M${x},${M.top + ih} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${M.top + ih} Z`;
            const label = `${d.label}: ${format(d.value)}${unit}`;
            const show = () =>
              setTip({
                x: (cx / W) * 100,
                y: (top / height) * 100,
                text: label,
              });
            return (
              <g key={d.label}>
                {/* Хулганы бай баганаас өргөн (жижиг утгатай баганыг ч сонгоход амар) */}
                <rect
                  x={cx - band / 2}
                  y={M.top}
                  width={band}
                  height={ih}
                  fill="transparent"
                  onMouseEnter={show}
                  onMouseLeave={() => setTip(null)}
                />
                <path
                  className="bar"
                  d={path}
                  tabIndex={0}
                  role="img"
                  aria-label={label}
                  onFocus={show}
                  onBlur={() => setTip(null)}
                  onMouseEnter={show}
                />
              </g>
            );
          })}
          {data.map((d, i) =>
            // Сүүлийн үеэс эхлэн тоолж, хамгийн сүүлийнх үргэлж харагдана (давхцахгүй)
            (data.length - 1 - i) % every === 0 ? (
              <text key={d.label} x={M.left + band * i + band / 2} y={height - 10} textAnchor="middle">
                {d.short || d.label}
              </text>
            ) : null,
          )}
        </svg>
        {tip && (
          <div
            className="chart-tip"
            style={{
              left: `${tip.x}%`,
              top: `${tip.y}%`,
            }}
            role="status"
          >
            {tip.text}
          </div>
        )}
      </div>
      <details className="small">
        <summary>{t('Хүснэгтээр харах')}</summary>
        <table>
          <thead>
            <tr>
              <th>{t('Хугацаа')}</th>
              <th>{title}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <td>{d.label}</td>
                <td>{d.value === null || d.value === undefined ? '—' : `${format(d.value)}${unit}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
