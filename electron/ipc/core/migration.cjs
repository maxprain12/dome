/* One-way vault migration; shared with boot, never a second storage mode. */
const { migrateLegacyVault, pendingVaultResources } = require('../../storage/vault-migration.cjs');
function register({ ipcMain, windowManager, database, fileStorage }) {
  ipcMain.handle('migration:migrateResources', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    const data = migrateLegacyVault({ database, fileStorage });
    return { success: data.failed === 0, data };
  });
  ipcMain.handle('migration:getStatus', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    const resources = pendingVaultResources(database).map(({ id, title }) => ({ id, title }));
    return { success: true, data: { pendingMigrations: resources.length, resources } };
  });
}
module.exports = { register };
