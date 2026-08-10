import React from 'react';

export function FloralMotifs() {
  return (
    <div className="yana-floral-layer" aria-hidden="true">
      <svg className="yana-lotus-motif" viewBox="0 0 420 300" focusable="false">
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M210 236c-42-34-66-74-60-121 34 11 56 36 60 72 4-36 26-61 60-72 6 47-18 87-60 121Z" />
          <path d="M210 226c-17-52-9-100 0-141 23 42 28 92 0 141Z" />
          <path d="M205 238c-65-12-109-45-130-91 45-3 82 15 112 55M215 238c65-12 109-45 130-91-45-3-82 15-112 55" />
          <path d="M96 244c67 23 161 25 228 0M130 263c49 12 111 13 160 0" />
        </g>
      </svg>

      <svg className="yana-sakura-motif" viewBox="0 0 300 300" focusable="false">
        <g fill="currentColor">
          <path d="M150 143c-34-22-51-55-33-79 18-24 51-8 52 27 16-31 52-35 66-8 14 27-10 55-49 66 37 13 53 47 31 69-22 22-55 4-67-31-12 35-45 53-67 31-22-22-6-56 31-69-39-11-63-39-49-66 14-27 50-23 66 8 1-35 34-51 52-27 18 24 1 57-33 79Z" />
          <circle cx="150" cy="150" r="17" />
          <circle cx="70" cy="54" r="7" />
          <circle cx="242" cy="242" r="5" />
        </g>
      </svg>
    </div>
  );
}
