type MenuApi = {
  removeAll: () => Promise<void>;
  create: (properties: { id: string; title: string; contexts: ['selection'] }, callback: () => void) => unknown;
};

/** Startup and onInstalled may run together; Chrome create completes via callback. */
export function createContextMenuSetup(menu: MenuApi, title: () => string, lastError: () => { message?: string } | undefined) {
  let pending = Promise.resolve();
  return () => {
    const task = pending.then(async () => {
      await menu.removeAll();
      await new Promise<void>((resolve, reject) => {
        menu.create({ id: 'dome-add-selection', title: title(), contexts: ['selection'] }, () => {
          const error = lastError();
          if (error) reject(new Error(error.message || 'Context menu creation failed'));
          else resolve();
        });
      });
    });
    pending = task.catch(() => undefined);
    return task;
  };
}
