/** Boot-time one-way migration and hierarchy repair. Missing vault files stay
 * missing: their canonical paths are retained for cloud hydration or recovery. */
const vault = require('./vault-store.cjs');
const { migrateLegacyVault } = require('./vault-migration.cjs');
function runBootReconcile(deps) {
  const repairedRefs = vault.repairFolderIntegrity(deps);
  const result = migrateLegacyVault(deps);
  if (result.failed) console.error('[VaultMigration] Incomplete:', result.errors);
  return { repairedRefs, ...result };
}
module.exports = { runBootReconcile };
