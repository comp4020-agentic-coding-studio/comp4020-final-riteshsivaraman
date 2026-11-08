// Touch mode: a phone or tablet (a coarse pointer, no keyboard) gets on-screen controls: a D-pad to walk, a button for
// whatever E does, a step-away button where Esc was. Dragging the view to look around already worked with a finger.
// `?touch=1` turns it on anywhere, for trying it on a desktop.
export const touchUi: boolean = (() => {
  try {
    return new URLSearchParams(location.search).has("touch") || window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
})();

// styles that only apply in touch mode hang off this class
if (touchUi && typeof document !== "undefined") document.documentElement.classList.add("touch");
