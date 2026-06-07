/* eslint-disable no-console */
function register({ ipcMain, windowManager, database, validateSender }) {
  ipcMain.handle('db:interactions:create', (event, interaction) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      queries.createInteraction.run(
        interaction.id,
        interaction.resource_id,
        interaction.type,
        interaction.content,
        interaction.position_data ? JSON.stringify(interaction.position_data) : null,
        interaction.metadata ? JSON.stringify(interaction.metadata) : null,
        interaction.created_at,
        interaction.updated_at
      );

      // Broadcast evento a todas las ventanas
      windowManager.broadcast('interaction:created', interaction);

      return { success: true, data: interaction };
    } catch (error) {
      console.error('[DB] Error creating interaction:', error);
      return { success: false, error: error.message };
    }
  });

  // Get interactions by resource
  ipcMain.handle('db:interactions:getByResource', (event, resourceId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const interactions = queries.getInteractionsByResource.all(resourceId);
      return { success: true, data: interactions };
    } catch (error) {
      console.error('[DB] Error getting interactions:', error);
      return { success: false, error: error.message };
    }
  });

  // Get interactions by type
  ipcMain.handle('db:interactions:getByType', (event, { resourceId, type }) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const interactions = queries.getInteractionsByType.all(resourceId, type);
      return { success: true, data: interactions };
    } catch (error) {
      console.error('[DB] Error getting interactions by type:', error);
      return { success: false, error: error.message };
    }
  });

  // Update interaction
  ipcMain.handle('db:interactions:update', (event, interaction) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      queries.updateInteraction.run(
        interaction.content,
        interaction.position_data ? JSON.stringify(interaction.position_data) : null,
        interaction.metadata ? JSON.stringify(interaction.metadata) : null,
        interaction.updated_at,
        interaction.id
      );

      // Broadcast evento a todas las ventanas
      windowManager.broadcast('interaction:updated', {
        id: interaction.id,
        updates: interaction
      });

      return { success: true, data: interaction };
    } catch (error) {
      console.error('[DB] Error updating interaction:', error);
      return { success: false, error: error.message };
    }
  });

  // Delete interaction
  ipcMain.handle('db:interactions:delete', (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      queries.deleteInteraction.run(id);

      // Broadcast evento a todas las ventanas
      windowManager.broadcast('interaction:deleted', { id });

      return { success: true };
    } catch (error) {
      console.error('[DB] Error deleting interaction:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
