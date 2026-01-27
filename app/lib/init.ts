/**
 * Initialization Module - Renderer Process
 * Communicates with the main process via IPC for initialization
 *
 * IMPORTANT: This file runs in the renderer process (Next.js)
 * All initialization operations are handled by the main process via IPC
 */

export interface InitResult {
  success: boolean;
  needsOnboarding: boolean;
  error?: string;
}

/**
 * Initialize the application
 * Returns a result indicating success/failure and onboarding status
 * 
 * IMPORTANT: This function always returns a result (never throws)
 * so the UI can always be shown, even if initialization fails
 */
export async function initializeApp(): Promise<InitResult> {
  console.log('🚀 Inicializando Dome...');

  // Check if we're running in a browser environment
  if (typeof window === 'undefined') {
    console.warn('⚠️ Window not available (SSR), using fallback');
    return {
      success: true,
      needsOnboarding: true,
    };
  }

  // Check if Electron API is available
  if (!window.electron) {
    console.warn('⚠️ Electron API not available, using fallback initialization');
    console.warn('⚠️ This is expected in development without Electron');
    return {
      success: true,
      needsOnboarding: true,
    };
  }

  // Check if init API is available
  if (!window.electron.init?.initialize) {
    console.warn('⚠️ Electron init API not available, using fallback');
    console.warn('⚠️ The preload script may not have loaded correctly');
    return {
      success: true,
      needsOnboarding: true,
      error: 'Init API not available',
    };
  }

  try {
    // Use IPC to initialize app in main process
    const result = await window.electron.init.initialize();
    
    // Validate response
    if (!result || typeof result !== 'object') {
      console.warn('⚠️ Invalid init response, using defaults');
      return {
        success: true,
        needsOnboarding: true,
        error: 'Invalid init response',
      };
    }

    console.log('✅ Dome inicializado:', result);
    return {
      success: result.success ?? true,
      needsOnboarding: result.needsOnboarding ?? true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error al inicializar Dome:', errorMessage);
    
    // Return success so UI is shown, but include error info
    return {
      success: true,
      needsOnboarding: true,
      error: errorMessage,
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
