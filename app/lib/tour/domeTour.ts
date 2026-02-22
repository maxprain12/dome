import { driver, type DriveStep, type Config } from 'driver.js';
import 'driver.js/dist/driver.css';

const TOUR_STEPS: DriveStep[] = [
  {
    element: '[data-tour="library"]',
    popover: {
      title: 'Library',
      description:
        'Tus archivos y enlaces recientes. Organiza notas, PDFs, videos y más.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="studio"]',
    popover: {
      title: 'Studio',
      description:
        'Genera mapas mentales, quizzes, guías y flashcards con IA.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="flashcards"]',
    popover: {
      title: 'Flashcards',
      description:
        'Repetición espaciada (SM-2). Mazos generados por IA.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="tags"]',
    popover: {
      title: 'Tags',
      description: 'Navega tus recursos por etiquetas.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="agents"]',
    popover: {
      title: 'Agentes',
      description:
        'Crea agentes personalizados con instrucciones y herramientas.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="search"]',
    popover: {
      title: 'Búsqueda',
      description:
        'Busca en tus recursos, añade URLs o importa archivos. Cmd+K para abrir. Escribe / para comandos.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="many"]',
    popover: {
      title: 'Many',
      description:
        'Tu asistente de IA. Chatea sobre tus recursos, búsqueda semántica, herramientas y memoria.',
      side: 'left',
      align: 'center',
    },
  },
  {
    element: '[data-tour="settings"]',
    popover: {
      title: 'Ajustes',
      description: 'Configura IA, apariencia y preferencias.',
      side: 'bottom',
      align: 'end',
    },
  },
];

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Inicia el tour guiado de Dome.
 * Solo tiene sentido en la ruta Home (/).
 * Los elementos deben tener data-tour en HomeSidebar y AppHeader.
 */
export function startDomeTour(): void {
  const isHome =
    typeof window !== 'undefined' &&
    window.location?.pathname === '/';

  if (!isHome) {
    return;
  }

  const config: Config = {
    steps: TOUR_STEPS,
    animate: !prefersReducedMotion(),
    showProgress: true,
    progressText: '{{current}} de {{total}}',
    nextBtnText: 'Siguiente',
    prevBtnText: 'Atrás',
    doneBtnText: 'Finalizar',
    overlayOpacity: 0.5,
    popoverClass: 'dome-tour-popover',
  };

  const driverObj = driver(config);
  driverObj.drive();
}
