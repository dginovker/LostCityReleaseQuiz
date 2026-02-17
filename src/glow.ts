/** 2004scape hover glow — swaps outset border color */

export function redglow(el: HTMLElement) {
  el.style.borderColor = '#ff3030'
}

export function greyglow(el: HTMLElement) {
  el.style.borderColor = '#aaa'
}

export function unglow(el: HTMLElement) {
  el.style.borderColor = ''
}
