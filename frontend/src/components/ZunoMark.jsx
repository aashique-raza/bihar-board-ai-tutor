import React from 'react';

export default function ZunoMark({ size = 34, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Zuno"
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      <rect x="4" y="4" width="92" height="92" rx="26" fill="var(--primary)" />
      <text x="50" y="70" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="58" fill="#FFFFFF">Z</text>
      <circle cx="35" cy="47" r="11" fill="none" stroke="#1A1208" strokeWidth="4" />
      <circle cx="65" cy="47" r="11" fill="none" stroke="#1A1208" strokeWidth="4" />
      <line x1="46" y1="47" x2="54" y2="47" stroke="#1A1208" strokeWidth="4" />
      <path d="M78 14 L81.5 21 L89 23.5 L81.5 26 L78 33 L74.5 26 L67 23.5 L74.5 21 Z" fill="#FCE7CF" />
    </svg>
  );
}
