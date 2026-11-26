// ЦАХИМ ВИЗ · E-VISA лого (docs/design/BRAND.md).
// Тэмдэг: паспортын хүрээ + бөмбөрцөг + баталгаажуулах тэмдэг. 24px-ээс бага үед бөмбөрцгийн шугамыг хасаж
// (simple) 16px-д ч уншигдахаар хялбаршуулна. Gradient-ийн id-г useId-ээр давхцуулахгүй.
import { useId } from 'react';

/** Лого тэмдэг. tone: 'color' (gradient дэвсгэр) | 'mono' (currentColor, дэвсгэргүй) */
export function LogoMark({ size = 40, tone = 'color', simple = size < 24, className = '', title }) {
  const gid = `lg${useId().replace(/:/g, '')}`;
  const mono = tone === 'mono';
  const ink = mono ? 'currentColor' : '#ffffff';
  return (
    <svg
      className={`logo-mark ${className}`}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {!mono && (
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2d9bff" />
            <stop offset="1" stopColor="#1fd0e5" />
          </linearGradient>
        </defs>
      )}
      {mono ? (
        <rect x="3" y="3" width="42" height="42" rx="12" fill="none" stroke="currentColor" strokeWidth="2.4" />
      ) : (
        <rect x="2" y="2" width="44" height="44" rx="13" fill={`url(#${gid})`} />
      )}
      {/* паспорт */}
      <rect x="13" y="9" width="22" height="30" rx="4" fill="none" stroke={ink} strokeWidth={simple ? 3 : 2.4} />
      {/* бөмбөрцөг */}
      {simple ? (
        <circle cx="24" cy="20" r="5" fill="none" stroke={ink} strokeWidth="2.4" />
      ) : (
        <g fill="none" stroke={ink} opacity="0.85">
          <circle cx="24" cy="20" r="6" strokeWidth="1.6" />
          <path d="M18 20h12M24 14c2.4 2.2 2.4 9.8 0 12M24 14c-2.4 2.2-2.4 9.8 0 12" strokeWidth="1.2" />
        </g>
      )}
      {/* баталгаажуулах тэмдэг */}
      <path
        d="M18.5 31.5l3.6 3.4 7.4-7.4"
        fill="none"
        stroke={ink}
        strokeWidth={simple ? 3.2 : 2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Бүтэн лого.
 * layout: 'horizontal' (тэмдэг + ЦАХИМ ВИЗ / E-VISA) | 'compact' (тэмдэг + ЦАХИМ ВИЗ) | 'symbol'
 * tone: 'auto' (горимын токен) | 'on-dark' | 'on-light' | 'mono' (currentColor)
 */
export default function Logo({ layout = 'horizontal', tone = 'auto', size = 40, className = '' }) {
  return (
    <span className={`logo-lockup logo-${layout} logo-tone-${tone} ${className}`}>
      <LogoMark size={size} tone={tone === 'mono' ? 'mono' : 'color'} />
      {layout !== 'symbol' && (
        <span className="logo-text">
          <span className="logo-name">ЦАХИМ ВИЗ</span>
          {layout === 'horizontal' && <span className="logo-sub">E-VISA</span>}
        </span>
      )}
    </span>
  );
}
