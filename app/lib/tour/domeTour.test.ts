import { expect, it, vi } from 'vitest';
import { startDomeTour } from './domeTour';

const drive = vi.hoisted(() => vi.fn());
vi.mock('driver.js', () => ({ driver: () => ({ drive }) }));

it('opens the nested Many destinations before starting the welcome tour', () => {
  const frame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  const trigger = document.createElement('button');
  trigger.dataset.tourGroup = 'many';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.onclick = () => trigger.setAttribute('aria-expanded', 'true');
  document.body.append(trigger);
  try {
    startDomeTour();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(drive).not.toHaveBeenCalled();
    frame.mock.calls[0][0](0);
    expect(drive).toHaveBeenCalledOnce();
  } finally {
    trigger.remove();
    frame.mockRestore();
  }
});
