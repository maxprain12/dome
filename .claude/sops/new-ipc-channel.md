# SOP: Adding a New IPC Channel

Follow these steps in order. Missing any step will cause the feature to silently fail.

## Step 1: Create or update the IPC handler file

File: `electron/ipc/<domain>.cjs`

```javascript
// electron/ipc/myfeature.cjs
'use strict';

const { ipcMain } = require('electron');

function registerMyFeatureHandlers(db) {
  // Always validate sender and sanitize inputs
  ipcMain.handle('myfeature:doSomething', async (event, arg) => {
    if (typeof arg !== 'string') {
      return { success: false, error: 'Invalid argument' };
    }
    try {
      const result = db.prepare('SELECT ...').get(arg);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerMyFeatureHandlers };
```

## Step 2: Register in the IPC index

File: `electron/ipc/index.cjs`

```javascript
const { registerMyFeatureHandlers } = require('./myfeature.cjs');
// ...
registerMyFeatureHandlers(db);
```

## Step 3: Whitelist in preload

File: `electron/preload.cjs` — add to ALLOWED_CHANNELS array:

```javascript
'myfeature:doSomething',
```

## Step 4: Call from renderer

```typescript
// In app/ - via window.electron
const result = await window.electron.invoke('myfeature:doSomething', someArg);
if (result.success) {
  // use result.data
} else {
  console.error(result.error);
}
```

## Step 5: Add TypeScript types (optional but recommended)

File: `app/types/global.d.ts` — add the new channel to the ElectronAPI interface.

## Checklist

- [ ] Handler file created/updated in `electron/ipc/`
- [ ] Handler registered in `electron/ipc/index.cjs`
- [ ] Channel name added to `electron/preload.cjs` ALLOWED_CHANNELS
- [ ] Input validation in handler (type check + sanitize)
- [ ] Error handling returns `{ success: false, error: string }` not throws
