// Teclado en pantalla para el tótem táctil (la TV no tiene teclado del sistema).
// Teclas grandes. Layout según el campo activo:
//   'letters'  → solo letras (nombre)
//   'email'    → letras + números + símbolos de correo
//   'numeric'  → solo números (teléfono)

const LAYOUTS = {
  letters: [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ñ'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
    ['{space}', '{bksp}'],
  ],
  email: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
    ['@', '.', '_', '-', '.com', '{bksp}'],
  ],
  numeric: [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['+', '0', '{bksp}'],
  ],
}

const labelFor = (k) =>
  k === '{bksp}' ? '⌫' : k === '{space}' ? 'espacio' : k

const isWide = (k) => k === '{space}' || k === '{bksp}' || k === '.com'

export default function OnScreenKeyboard({ layout = 'letters', onKey }) {
  const rows = LAYOUTS[layout] || LAYOUTS.letters
  return (
    <div className={`vk vk--${layout}`} aria-hidden="true">
      {rows.map((row, i) => (
        <div className="vk__row" key={i}>
          {row.map((k) => (
            <button
              type="button"
              key={k}
              className={`vk__key${isWide(k) ? ' vk__key--wide' : ''}${k === '{bksp}' ? ' vk__key--bksp' : ''}`}
              // pointerdown + preventDefault: la tecla no roba el foco del campo
              onPointerDown={(e) => {
                e.preventDefault()
                onKey(k)
              }}
            >
              {labelFor(k)}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
