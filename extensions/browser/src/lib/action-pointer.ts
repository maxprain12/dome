let host: HTMLElement | null = null;
let pointer: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;

export function hideActionPointer() {
  generation += 1;
  clearTimeout(timer);
  host?.remove();
  host = null;
  pointer = null;
}

/** A visual pointer only: events still target the validated DOM reference. */
export async function showActionPointer(node: HTMLElement, frames: HTMLIFrameElement[]): Promise<boolean> {
  const current = ++generation;
  clearTimeout(timer);
  node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  if (!host) {
    host = document.createElement('div');
    host.setAttribute('data-dome-agent-ui', 'pointer');
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>
      :host { all: initial; pointer-events:none; }
      .cursor { position:fixed; left:0; top:0; display:flex; align-items:center; gap:4px; color:CanvasText; transition:transform 260ms cubic-bezier(.2,.8,.2,1); }
      svg { width:25px; height:30px; fill:CanvasText; stroke:Canvas; stroke-width:1.5; filter:drop-shadow(0 1px 2px GrayText); }
      span { font:600 12px system-ui; padding:5px 9px; border-radius:7px; background:Canvas; color:CanvasText; border:1px solid GrayText; }
      .ring { position:fixed; width:28px; height:28px; margin:-14px; border:2px solid Highlight; border-radius:50%; opacity:0; }
      .ring.active { animation:tap 700ms ease-out; }
      @keyframes tap { from { opacity:1; transform:scale(.5) } to { opacity:0; transform:scale(1.5) } }
      @media(prefers-reduced-motion:reduce) { .cursor { transition:none } .ring.active { animation:none } }
    </style><div class="ring"></div><div class="cursor"><svg viewBox="0 0 24 30" aria-hidden="true"><path d="M2 2v23l6-6 5 9 4-2-5-9h9z"/></svg><span>Many</span></div>`;
    document.documentElement.append(host);
    pointer = shadow.querySelector('.cursor');
  }
  for (const frame of frames) frame.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  pointer!.getBoundingClientRect();
  await new Promise<void>((resolve) => setTimeout(resolve, 16));
  if (generation !== current || !host) return false;
  const box = node.getBoundingClientRect();
  let x = box.left + Math.min(box.width / 2, 32);
  let y = box.top + Math.min(box.height / 2, 20);
  for (const frame of frames) {
    const rect = frame.getBoundingClientRect();
    x += rect.left + frame.clientLeft;
    y += rect.top + frame.clientTop;
  }
  pointer!.style.transform = `translate(${x}px,${y}px)`;
  await new Promise((resolve) => setTimeout(resolve, 280));
  if (generation !== current || !host) return false;
  const ring = pointer!.parentNode!.querySelector<HTMLElement>('.ring')!;
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  ring.className = 'ring active';
  timer = setTimeout(hideActionPointer, 1200);
  return true;
}
