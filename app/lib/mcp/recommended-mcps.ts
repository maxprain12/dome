/**
 * Recommended MCPs for Dome - One-Click install catalog (Marketplace)
 */

export interface MCPServerConfig {
  name: string;
  type: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface RecommendedMCP {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'filesystem' | 'cloud' | 'data' | 'search' | 'memory' | 'dev';
  requiresConfig?: 'folder' | 'connectionString' | 'env' | 'token';
  /** For requiresConfig 'token': where to store the token */
  tokenPlacement?: 'header' | 'env';
  /** For tokenPlacement 'env': the env var name (e.g. GITHUB_PERSONAL_ACCESS_TOKEN) */
  tokenEnvVar?: string;
  buildConfig: (userInput?: string, token?: string) => MCPServerConfig;
  installPreview: string;
  /** Optional note (e.g. "Requires uv installed") */
  note?: string;
  /** If set, show "Conectar con OAuth" to open browser and capture token via redirect */
  authFlow?: 'oauth';
  /** OAuth provider id for startOAuthFlow (e.g. 'neon') */
  oauthProviderId?: string;
}

export const RECOMMENDED_MCPS: RecommendedMCP[] = [
  {
    id: 'alphaxiv',
    name: 'alphaXiv',
    description: 'Búsqueda de papers de ML y análisis de PDFs.',
    icon: 'FileText',
    category: 'search',
    installPreview: 'https://api.alphaxiv.org/mcp/v1',
    buildConfig: () => ({
      name: 'alphaxiv',
      type: 'http',
      url: 'https://api.alphaxiv.org/mcp/v1',
      enabled: true,
    }),
  },
  {
    id: 'atlassian',
    name: 'Atlassian',
    description: 'Jira y Confluence: gestión de proyectos y colaboración.',
    icon: 'Layers',
    category: 'cloud',
    requiresConfig: 'token',
    tokenPlacement: 'header',
    installPreview: 'https://mcp.atlassian.com/v1/mcp',
    note: 'Introduce tu token API de Atlassian.',
    buildConfig: (_userInput?, token?) => ({
      name: 'atlassian',
      type: 'http',
      url: 'https://mcp.atlassian.com/v1/mcp',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      enabled: true,
    }),
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Control de versiones y desarrollo colaborativo.',
    icon: 'GitBranch',
    category: 'dev',
    requiresConfig: 'token',
    tokenPlacement: 'env',
    tokenEnvVar: 'GITHUB_PERSONAL_ACCESS_TOKEN',
    installPreview: 'docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server',
    note: 'Requiere Docker. Introduce tu GitHub PAT.',
    buildConfig: (_userInput?, token?) => ({
      name: 'github',
      type: 'stdio',
      command: 'docker',
      args: ['run', '-i', '--rm', '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'ghcr.io/github/github-mcp-server'],
      env: token ? { GITHUB_PERSONAL_ACCESS_TOKEN: token } : undefined,
      enabled: true,
    }),
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Gestión de issues y proyectos de desarrollo.',
    icon: 'List',
    category: 'cloud',
    requiresConfig: 'token',
    tokenPlacement: 'header',
    installPreview: 'https://mcp.linear.app/mcp',
    note: 'Introduce tu API key de Linear.',
    buildConfig: (_userInput?, token?) => ({
      name: 'linear',
      type: 'http',
      url: 'https://mcp.linear.app/mcp',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      enabled: true,
    }),
  },
  {
    id: 'railway',
    name: 'Railway',
    description: 'Despliegue de apps, bases de datos y servicios.',
    icon: 'Zap',
    category: 'dev',
    requiresConfig: 'token',
    tokenPlacement: 'env',
    tokenEnvVar: 'RAILWAY_TOKEN',
    installPreview: 'npx -y @railway/mcp-server',
    note: 'Introduce tu token de Railway.',
    buildConfig: (_userInput?, token?) => ({
      name: 'railway',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@railway/mcp-server'],
      env: token ? { RAILWAY_TOKEN: token } : undefined,
      enabled: true,
    }),
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Gestión de Neon Postgres (Remote Hosted).',
    icon: 'Database',
    category: 'data',
    requiresConfig: 'token',
    tokenPlacement: 'header',
    installPreview: 'npx add-mcp https://mcp.neon.tech/mcp --header "Authorization: Bearer <$NEON_API_KEY>"',
    note: 'Crea una API key en Neon Console. Usa una de organización para limitar el acceso.',
    buildConfig: (_userInput?, token?) => ({
      name: 'neon',
      type: 'http',
      url: 'https://mcp.neon.tech/mcp',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      enabled: true,
    }),
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Comunicación y colaboración en equipo.',
    icon: 'MessageSquare',
    category: 'cloud',
    requiresConfig: 'token',
    tokenPlacement: 'header',
    installPreview: 'https://mcp.slack.com/mcp',
    note: 'Introduce tu token de Slack.',
    buildConfig: (_userInput?, token?) => ({
      name: 'slack',
      type: 'http',
      url: 'https://mcp.slack.com/mcp',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      enabled: true,
    }),
  },
  {
    id: 'you',
    name: 'You.com',
    description: 'Búsqueda web e investigación con IA.',
    icon: 'Search',
    category: 'search',
    requiresConfig: 'token',
    tokenPlacement: 'header',
    installPreview: 'https://api.you.com/mcp',
    note: 'Authorization: Bearer API_KEY. Introduce tu API key de You.com.',
    buildConfig: (_userInput?, token?) => ({
      name: 'you',
      type: 'http',
      url: 'https://api.you.com/mcp',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      enabled: true,
    }),
  },
  {
    id: 'dbhub',
    name: 'DBHub',
    description: 'Conector universal para MySQL, PostgreSQL, SQL Server.',
    icon: 'Database',
    category: 'data',
    requiresConfig: 'connectionString',
    installPreview: 'npx @bytebase/dbhub --transport stdio --dsn postgres://...',
    note: 'Introduce tu connection string (DSN).',
    buildConfig: (dsn?: string) => ({
      name: 'dbhub',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@bytebase/dbhub', '--transport', 'stdio', '--dsn', dsn || 'postgres://localhost:5432'],
      enabled: true,
    }),
  },
];
