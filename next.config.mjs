import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Solo usar 'export' en producción, en desarrollo permitir rutas dinámicas
  // Esto evita el error de generateStaticParams con rutas dinámicas en desarrollo
  ...(process.env.NODE_ENV === 'production' ? { output: 'export' } : {}),
  distDir: 'out',
  // trailingSlash ensures routes are generated as /page/index.html for proper file:// loading in Electron
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        path: false,
        crypto: false,
      };

      // Alias bun: protocol imports to stub modules for webpack
      // At runtime in Electron, the actual modules will be available
      config.resolve.alias = {
        ...config.resolve.alias,
        'bun:sqlite': resolve(__dirname, 'app/lib/db/__stubs__/bun-sqlite.ts'),
      };

      // Externalize native modules for Electron renderer
      // Use a function to properly handle all external dependencies
      const originalExternals = config.externals || [];
      config.externals = [
        ...( Array.isArray(originalExternals) ? originalExternals : [originalExternals]),
        function ({ context, request }, callback) {
          // Externalize vectordb and related packages
          if (request === 'vectordb' || /^@lancedb\//.test(request)) {
            return callback(null, 'commonjs ' + request);
          }
          callback();
        },
      ];
    }

    // Handle .node files
    config.module.rules.push({
      test: /\.node$/,
      type: 'asset/resource',
    });

    // Ignore non-JS files in node_modules that webpack tries to parse
    config.module.rules.push({
      test: /node_modules.*\.(md|txt)$/,
      type: 'asset/resource',
      generator: {
        emit: false,
      },
    });

    return config;
  },
};

export default nextConfig;
