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
  const startTime = Date.now();
  console.info('[Init-Renderer] Dome initialized');

  // Check if we're running in a browser environment
  if (typeof window === 'undefined') {
    console.warn('[Init-Renderer] Window not available (SSR), using fallback');
    return {
      success: true,
      needsOnboarding: true,
    };
  }

  // Check if Electron API is available
  if (!window.electron) {
    console.warn('[Init-Renderer] Electron API not available, using fallback initialization');
    console.warn('[Init-Renderer] This is expected in development without Electron');
    return {
      success: true,
      needsOnboarding: true,
    };
  }

  // Log available APIs
  console.info('[Init-Renderer] Available electron APIs:', Object.keys(window.electron));

  // Check if init API is available
  if (!window.electron.init?.initialize) {
    console.warn('[Init-Renderer] Electron init API not available, using fallback');
    console.warn('[Init-Renderer] The preload script may not have loaded correctly');
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
      console.warn('[Init-Renderer] Invalid init response, using defaults');
      return {
        success: true,
        needsOnboarding: true,
        error: 'Invalid init response',
      };
    }

    console.info(`[Init-Renderer] Dome initialized in ${Date.now() - startTime}ms`);
    return {
      success: result.success ?? true,
      needsOnboarding: result.needsOnboarding ?? true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Init-Renderer] ❌ Error al inicializar Dome:', errorMessage);
    console.error('[Init-Renderer] Stack:', error instanceof Error ? error.stack : 'N/A');
    
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

  console.info('Cleaning development data...');
  // TODO: Implementar limpieza de bases de datos vía IPC
}
