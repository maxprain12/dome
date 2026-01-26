/**
 * Initialization Module - Renderer Process
 * Communicates with the main process via IPC for initialization
 *
 * IMPORTANT: This file runs in the renderer process (Next.js)
 * All initialization operations are handled by the main process via IPC
 */

// Inicializar toda la aplicación
export async function initializeApp() {
  console.log('🚀 Inicializando Dome...');

  // Check if we're running in Electron
  if (typeof window === 'undefined' || !window.electron?.init) {
    // Fallback for development without Electron
    console.warn('⚠️ Electron API not available, using fallback initialization');
    return {
      success: true,
      needsOnboarding: true,
    };
  }

  try {
    // Use IPC to initialize app in main process
    const result = await window.electron.init.initialize();
    return result;
  } catch (error) {
    console.error('❌ Error al inicializar Dome:', error);
    // Return success but with onboarding needed to at least show the UI
    return {
      success: true,
      needsOnboarding: true,
    };
  }
}

// Función para limpiar datos de desarrollo
export function cleanDevelopmentData() {
  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️ No se puede limpiar datos en producción');
    return;
  }

  console.log('🧹 Limpiando datos de desarrollo...');
  // TODO: Implementar limpieza de bases de datos vía IPC
}
