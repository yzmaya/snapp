// Marca SNAPP: badge de cámara + wordmark, reconstruida a partir del logo.
export function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="3"
        y="7"
        width="18"
        height="13"
        rx="3"
        stroke="#fff"
        strokeWidth="1.8"
      />
      <path
        d="M8 7l1.6-2.2h4.8L16 7"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13.5" r="3.4" stroke="#fff" strokeWidth="1.8" />
    </svg>
  )
}

export default function Brand() {
  return (
    <header className="brand">
      <div className="brand__badge">
        <CameraIcon />
      </div>
      <div className="brand__text">
        <span className="brand__eyebrow">
          Activación fotográfica con IA
        </span>
        <span className="wordmark">SNAPP</span>
      </div>
    </header>
  )
}
