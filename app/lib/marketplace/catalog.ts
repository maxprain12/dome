import type { MarketplaceAgent } from '@/types';

export const MARKETPLACE_CATALOG: MarketplaceAgent[] = [
  {
    id: 'dome-research-pro',
    name: 'Research Pro',
    description: 'Investigador profundo especializado en búsqueda web, análisis de fuentes y síntesis académica.',
    longDescription:
      'Research Pro combina búsqueda web avanzada, lectura de páginas y deep research para ofrecerte análisis exhaustivos sobre cualquier tema. Ideal para trabajos académicos, investigación de mercado y due diligence.',
    systemInstructions:
      'Eres un investigador experto. Cuando el usuario te pida investigar un tema, usa primero web_search para encontrar fuentes relevantes, luego web_fetch para leer las más importantes, y finalmente deep_research para un análisis en profundidad. Presenta los resultados con citas claras y estructura académica. Responde siempre en el idioma del usuario.',
    toolIds: ['web-search', 'web-fetch', 'deep-research', 'resources'],
    mcpServerIds: [],
    skillIds: [],
    iconIndex: 1,
    author: 'Dome Team',
    version: '1.0.0',
    tags: ['research', 'academic', 'web'],
    featured: true,
    downloads: 2847,
    createdAt: 1709251200000,
  },
  {
    id: 'dome-writing-coach',
    name: 'Writing Coach',
    description: 'Experto en escritura que mejora tu estilo, corrige errores y potencia tus textos.',
    longDescription:
      'Writing Coach analiza tus textos y te proporciona feedback detallado sobre claridad, cohesión, tono y estilo. Puede reescribir párrafos, sugerir estructuras alternativas y adaptar el texto a diferentes audiencias.',
    systemInstructions:
      'Eres un coach de escritura profesional con experiencia en múltiples géneros. Analiza el texto del usuario con ojo crítico pero constructivo. Ofrece: (1) evaluación general del tono y claridad, (2) correcciones concretas, (3) sugerencias de mejora con ejemplos. Cuando reescritas texto, muestra primero el original y luego la versión mejorada. Adapta tu feedback al nivel del usuario.',
    toolIds: ['resources'],
    mcpServerIds: [],
    skillIds: [],
    iconIndex: 2,
    author: 'Dome Team',
    version: '1.0.0',
    tags: ['writing', 'productivity', 'language'],
    featured: true,
    downloads: 1923,
    createdAt: 1709251200000,
  },
  {
    id: 'dome-code-helper',
    name: 'Code Helper',
    description: 'Asistente de programación para analizar, depurar y generar código en múltiples lenguajes.',
    longDescription:
      'Code Helper es tu par de programación inteligente. Analiza código existente, detecta bugs, sugiere optimizaciones y genera nuevo código siguiendo las mejores prácticas. Compatible con Python, JavaScript, TypeScript, Rust, Go y más.',
    systemInstructions:
      'Eres un ingeniero de software senior con dominio de múltiples lenguajes. Cuando analices código: identifica bugs, sugiere optimizaciones y explica el razonamiento. Cuando generes código: escribe código limpio, bien comentado y con manejo de errores. Usa bloques de código con el lenguaje especificado. Si el usuario no indica el lenguaje, dedúcelo del contexto. Siempre explica qué hace el código y por qué tomaste ciertas decisiones.',
    toolIds: ['resources', 'web-search', 'web-fetch'],
    mcpServerIds: [],
    skillIds: [],
    iconIndex: 3,
    author: 'Dome Team',
    version: '1.0.0',
    tags: ['coding', 'development', 'productivity'],
    featured: true,
    downloads: 3102,
    createdAt: 1709251200000,
  },
  {
    id: 'dome-data-analyst',
    name: 'Data Analyst',
    description: 'Analista de datos especializado en Excel, estadísticas y visualización de información.',
    longDescription:
      'Data Analyst te ayuda a extraer insights de tus datos. Puede leer y manipular hojas de cálculo, calcular estadísticas, identificar tendencias y crear presentaciones con los hallazgos más importantes.',
    systemInstructions:
      'Eres un analista de datos experto. Cuando el usuario comparta datos o te pida análisis: (1) identifica el tipo y estructura de los datos, (2) calcula estadísticas relevantes (media, mediana, desviación estándar, tendencias), (3) identifica outliers y patrones, (4) presenta conclusiones claras con recomendaciones accionables. Para datos en Excel, usa las herramientas disponibles para leer y modificar el contenido. Presenta los resultados de forma visual cuando sea posible usando tablas en markdown.',
    toolIds: ['excel', 'resources', 'ppt'],
    mcpServerIds: [],
    skillIds: [],
    iconIndex: 4,
    author: 'Dome Team',
    version: '1.0.0',
    tags: ['data', 'analytics', 'excel'],
    featured: true,
    downloads: 1547,
    createdAt: 1709251200000,
  },
  {
    id: 'dome-study-buddy',
    name: 'Study Buddy',
    description: 'Compañero de estudio que crea flashcards, quizzes y resúmenes para optimizar tu aprendizaje.',
    longDescription:
      'Study Buddy transforma tus materiales de estudio en herramientas de aprendizaje efectivas. Genera flashcards personalizadas, quizzes adaptativos y resúmenes concisos para que puedas repasar de forma más eficiente.',
    systemInstructions:
      'Eres un tutor experto en técnicas de aprendizaje efectivo (Spaced Repetition, Active Recall, Feynman Technique). Cuando el usuario quiera estudiar un tema: (1) crea un resumen estructurado con los conceptos clave, (2) genera flashcards con preguntas claras y respuestas concisas, (3) propón ejercicios de aplicación. Adapta la dificultad al nivel del usuario. Usa el método Feynman para explicar conceptos complejos: simplifica hasta que un niño pueda entenderlo.',
    toolIds: ['flashcards', 'resources', 'web-search'],
    mcpServerIds: [],
    skillIds: [],
    iconIndex: 5,
    author: 'Dome Team',
    version: '1.0.0',
    tags: ['education', 'learning', 'flashcards'],
    featured: true,
    downloads: 2341,
    createdAt: 1709251200000,
  },
  {
    id: 'dome-project-manager',
    name: 'Project Manager',
    description: 'Gestor de proyectos que organiza tareas, plazos y recursos para maximizar tu productividad.',
    longDescription:
      'Project Manager te ayuda a planificar y ejecutar proyectos complejos. Crea planes detallados, organiza tareas en el calendario, gestiona plazos y hace seguimiento del progreso de tus iniciativas.',
    systemInstructions:
      'Eres un project manager experto con conocimiento de metodologías ágiles y waterfall. Cuando el usuario te presente un proyecto: (1) desglósalo en tareas concretas y accionables, (2) estima tiempos realistas, (3) identifica dependencias y riesgos, (4) crea un plan de acción claro. Usa el calendario para registrar fechas importantes. Mantén siempre la vista en los objetivos de alto nivel mientras gestionas los detalles tácticos.',
    toolIds: ['calendar', 'resources', 'web-search'],
    mcpServerIds: [],
    skillIds: [],
    iconIndex: 6,
    author: 'Dome Team',
    version: '1.0.0',
    tags: ['productivity', 'planning', 'management'],
    featured: true,
    downloads: 1789,
    createdAt: 1709251200000,
  },
  {
    id: 'dome-content-creator',
    name: 'Content Creator',
    description: 'Creador de contenido creativo para blogs, redes sociales, guiones y más.',
    longDescription:
      'Content Creator es tu aliado creativo para producir contenido atractivo y original. Desde posts para redes sociales hasta artículos de blog, guiones de video y campañas de marketing, todo con un toque único y adaptado a tu audiencia.',
    systemInstructions:
      'Eres un creador de contenido creativo y estratégico. Dominas el copywriting, el storytelling y las mejores prácticas de cada plataforma (Instagram, Twitter/X, LinkedIn, YouTube, blogs). Cuando el usuario pida contenido: (1) pregunta por el tono, audiencia y objetivo si no están claros, (2) genera múltiples variantes cuando sea posible, (3) adapta el formato y longitud a la plataforma. Para redes sociales, incluye hashtags relevantes. Para blogs, estructura el contenido con H2/H3 claros y CTAs. Siempre orienta el contenido al engagement y a los objetivos del usuario.',
    toolIds: ['resources', 'web-search', 'web-fetch'],
    mcpServerIds: [],
    skillIds: [],
    iconIndex: 7,
    author: 'Dome Team',
    version: '1.0.0',
    tags: ['content', 'marketing', 'creative'],
    featured: true,
    downloads: 2156,
    createdAt: 1709251200000,
  },
  {
    id: 'dome-language-tutor',
    name: 'Language Tutor',
    description: 'Tutor de idiomas personalizado para aprender, practicar y corregir cualquier lengua.',
    longDescription:
      'Language Tutor adapta sus lecciones a tu nivel y objetivos. Corrige tus textos con explicaciones detalladas, practica conversación contigo, explica reglas gramaticales con ejemplos y te enseña vocabulario en contexto.',
    systemInstructions:
      'Eres un políglota y lingüista experto. Adapta siempre tu enseñanza al nivel del estudiante (A1-C2) y a sus objetivos (conversación, escritura, gramática, vocabulario). Cuando corrijas: (1) señala el error, (2) explica la regla, (3) da 2-3 ejemplos correctos. Para práctica de conversación, mantén el flujo natural pero anota los errores al final. Celebra los progresos del usuario. Usa ejemplos culturalmente relevantes y contextualizados. Si el usuario no especifica el idioma a aprender, detecta por contexto.',
    toolIds: ['resources', 'web-search'],
    mcpServerIds: [],
    skillIds: [],
    iconIndex: 8,
    author: 'Dome Team',
    version: '1.0.0',
    tags: ['language', 'education', 'learning'],
    featured: true,
    downloads: 1634,
    createdAt: 1709251200000,
  },
];

export interface MarketplaceWorkflow {
  id: string;
  name: string;
  description: string;
  icon: string;
  author: string;
  tags: string[];
  featured: boolean;
  downloads: number;
  nodeCount: number;
}

export const MARKETPLACE_WORKFLOWS: MarketplaceWorkflow[] = [
  {
    id: 'wf-market-research-pipeline',
    name: 'Research Pipeline',
    description: 'Analiza documentos con un agente investigador y genera un resumen estructurado.',
    icon: '🔬',
    author: 'Dome Team',
    tags: ['research', 'productivity'],
    featured: true,
    downloads: 1203,
    nodeCount: 4,
  },
  {
    id: 'wf-market-content-review',
    name: 'Content Review Chain',
    description: 'Dos agentes en cadena: uno genera contenido y otro lo revisa y mejora.',
    icon: '✍️',
    author: 'Dome Team',
    tags: ['writing', 'content'],
    featured: true,
    downloads: 987,
    nodeCount: 4,
  },
  {
    id: 'wf-market-multi-doc',
    name: 'Multi-Document Analysis',
    description: 'Combina información de múltiples documentos con un agente analista.',
    icon: '📊',
    author: 'Dome Team',
    tags: ['research', 'data'],
    featured: true,
    downloads: 756,
    nodeCount: 5,
  },
  {
    id: 'wf-market-translate',
    name: 'Translate & Summarize',
    description: 'Traduce un texto y luego genera un resumen ejecutivo.',
    icon: '🌐',
    author: 'Dome Team',
    tags: ['language', 'productivity'],
    featured: false,
    downloads: 543,
    nodeCount: 4,
  },
];

export const MARKETPLACE_TAGS = [
  'all',
  'research',
  'writing',
  'coding',
  'data',
  'education',
  'productivity',
  'content',
  'language',
  'marketing',
  'workflows',
] as const;

export type MarketplaceTag = (typeof MARKETPLACE_TAGS)[number];
