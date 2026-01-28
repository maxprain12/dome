# ZeroRPC vs MCP: Evaluación para Integración PageIndex

**Fecha:** 2026-01-28
**Contexto:** Alternativa de integración para PageIndex (Python) con Electron

---

## Comparación: ZeroRPC vs MCP

### ZeroRPC (electron-zerorpc-example)

**¿Qué es?**
- Biblioteca de mensajería RPC sobre ZeroMQ + msgpack
- Permite comunicación directa entre Node.js y Python
- Llamadas de función transparentes entre lenguajes
- Ejemplo: [pazrul/electron-zerorpc-example](https://github.com/pazrul/electron-zerorpc-example)

**Arquitectura:**
```
┌─────────────────────────┐
│  Electron Renderer      │
│  (React/HTML)           │
└───────────┬─────────────┘
            │ IPC
┌───────────▼─────────────┐
│  Electron Main Process  │
│  (zerorpc client)       │
└───────────┬─────────────┘
            │ ZeroRPC (TCP/IPC)
┌───────────▼─────────────┐
│  Python Backend         │
│  (zerorpc server)       │
│  PageIndex aquí         │
└─────────────────────────┘
```

**Ejemplo de código:**
```javascript
// Main process
const zerorpc = require("zerorpc");
const client = new zerorpc.Client();
client.connect("tcp://127.0.0.1:4242");

// Llamar función Python
client.invoke("build_tree", pdfPath, (error, res) => {
  if (error) {
    console.error(error);
  } else {
    console.log("Tree built:", res);
  }
});
```

```python
# Python server
import zerorpc
from pageindex import PageIndex

class PageIndexService:
    def build_tree(self, pdf_path):
        # Usar PageIndex aquí
        tree = PageIndex.build(pdf_path)
        return tree

    def search(self, query, doc_id):
        results = PageIndex.search(query, doc_id)
        return results

server = zerorpc.Server(PageIndexService())
server.bind("tcp://0.0.0.0:4242")
server.run()
```

**Pros:**
- ✅ **Muy simple** - Pocas líneas de código
- ✅ **Directo** - Llamadas RPC transparentes
- ✅ **Sin HTTP overhead** - TCP directo
- ✅ **Serialización automática** - JSON/msgpack
- ✅ **Ejemplo probado** - electron-zerorpc-example funciona
- ✅ **Rápido de implementar** - 1-2 días para prototipo

**Contras:**
- ❌ **Tecnología legacy** - Poco mantenida (último commit 2020)
- ❌ **Problemas con Electron moderno** - Requiere Node 8.x (viejo)
- ❌ **Compatibilidad** - Problemas con packaging ([Issue #95](https://github.com/0rpc/zerorpc-node/issues/95))
- ❌ **Dependencias nativas** - ZeroMQ requiere compilación
- ❌ **No es estándar** - Tecnología propietaria del proyecto 0rpc
- ❌ **Linux/Mac bias** - Problemas en Windows

**Estado en 2026:**
> "zerorpc appears to be legacy technology with limited recent activity and known compatibility issues with modern Electron versions"

---

### Model Context Protocol (MCP)

**¿Qué es?**
- Estándar moderno de Anthropic (Nov 2024)
- Protocolo para conectar AI con herramientas
- Parte de Linux Foundation (Dic 2025)
- Respaldado por: Anthropic, OpenAI, Microsoft, Google

**Arquitectura:**
```
┌─────────────────────────┐
│  Electron Renderer      │
│  (React/HTML)           │
└───────────┬─────────────┘
            │ IPC
┌───────────▼─────────────┐
│  Electron Main Process  │
│  (@modelcontextprotocol │
│   /sdk MCP client)      │
└───────────┬─────────────┘
            │ MCP Protocol (stdio/HTTP)
┌───────────▼─────────────┐
│  PageIndex MCP Server   │
│  (Python)               │
│  - Tools                │
│  - Resources            │
│  - Prompts              │
└─────────────────────────┘
```

**Ejemplo de código:**
```typescript
// Electron main - MCP client
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "python",
  args: ["pageindex_mcp_server.py"],
});

const client = new Client({
  name: "dome-client",
  version: "1.0.0",
}, {
  capabilities: { tools: {} },
});

await client.connect(transport);

// Llamar tool
const result = await client.callTool({
  name: "pageindex_build_tree",
  arguments: { pdf_path: "/path/to/doc.pdf" },
});
```

```python
# Python MCP server
from mcp.server import Server
from pageindex import PageIndex

server = Server("pageindex-server")

@server.call_tool()
async def pageindex_build_tree(pdf_path: str):
    tree = PageIndex.build(pdf_path)
    return tree

@server.call_tool()
async def pageindex_search(query: str, doc_id: str):
    results = PageIndex.search(query, doc_id)
    return results

if __name__ == "__main__":
    server.run()
```

**Pros:**
- ✅ **Estándar de industria** - Respaldado por gigantes tech
- ✅ **Moderno** - Diseñado para AI en 2024-2026
- ✅ **Activamente mantenido** - Actualizaciones frecuentes
- ✅ **Ecosistema creciente** - Muchos servidores MCP disponibles
- ✅ **Future-proof** - Inversión a largo plazo
- ✅ **Documentación oficial** - SDKs TypeScript y Python
- ✅ **Compatible Electron** - Funciona con versiones modernas
- ✅ **Multi-transporte** - stdio, HTTP, WebSocket

**Contras:**
- ❌ **Más complejo** - Más boilerplate que ZeroRPC
- ❌ **Overhead adicional** - Protocolo más pesado
- ❌ **Curva de aprendizaje** - Nuevo estándar
- ⏱️ **Tiempo de implementación** - 3-5 días para prototipo

**Estado en 2026:**
> "The Model Context Protocol (MCP) transforms AI agent deployment in 2026, enabling seamless integration across tools, databases, and workflows"

---

## Análisis para Dome + PageIndex

### Opción 1: ZeroRPC (Prototipo Rápido) ⚡

**Cuándo usar:**
- Necesitas prototipo funcionando YA (1-2 días)
- Solo para testing/validación de PageIndex
- No vas a packagear la app todavía
- Desarrollo local en Linux/Mac

**Riesgos:**
- Puede no funcionar en producción
- Problemas al hacer `electron:build`
- Incompatibilidades con dependencias modernas

**Recomendación:** ✅ **Para validar concepto solamente**

---

### Opción 2: MCP (Producción) 🏆 **RECOMENDADA**

**Cuándo usar:**
- Implementación a largo plazo
- Necesitas packaging funcionando
- Quieres seguir estándares modernos
- Compatibilidad multi-plataforma

**Inversión:**
- 3-5 días prototipo inicial
- Pero código más limpio y mantenible

**Recomendación:** ✅ **Para implementación final**

---

### Opción 3: Híbrida (Mejor de Ambos) ⭐

**Estrategia:**
1. **Fase 1 (1-2 días):** Prototipo rápido con ZeroRPC
   - Validar que PageIndex funciona
   - Benchmarking vs vector search
   - Decisión: ¿continuar con PageIndex?

2. **Fase 2 (3-5 días):** Migrar a MCP si fase 1 es exitosa
   - Implementación productiva
   - Packaging funcional
   - Listo para usuarios

**Ventajas:**
- ✅ Validación rápida (bajo riesgo)
- ✅ Decisión informada
- ✅ Código final moderno
- ✅ No perder tiempo si PageIndex no funciona bien

**Recomendación:** ✅✅✅ **ÓPTIMA**

---

## Comparación Técnica

| Característica | ZeroRPC | MCP | Ganador |
|----------------|---------|-----|---------|
| Simplicidad código | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ZeroRPC |
| Tiempo implementación | 1-2 días | 3-5 días | ZeroRPC |
| Mantenimiento | ⭐ (legacy) | ⭐⭐⭐⭐⭐ | MCP |
| Electron moderno | ⭐⭐ (problemas) | ⭐⭐⭐⭐⭐ | MCP |
| Packaging | ⭐⭐ (issues) | ⭐⭐⭐⭐ | MCP |
| Windows compat | ⭐⭐ | ⭐⭐⭐⭐ | MCP |
| Estándar industria | ❌ | ✅ | MCP |
| Documentación | ⭐⭐ | ⭐⭐⭐⭐⭐ | MCP |
| Comunidad 2026 | ⭐ | ⭐⭐⭐⭐⭐ | MCP |
| Future-proof | ❌ | ✅ | MCP |

**Ganador general:** **MCP** (para producción)
**Ganador velocidad:** **ZeroRPC** (para prototipo)

---

## Alternativa 4: Implementación TypeScript Nativa

**No usar Python, reimplementar conceptos en TypeScript**

Ventajas sobre ambos:
- ✅ **Cero dependencias externas**
- ✅ **No necesita Python runtime**
- ✅ **Funciona 100% offline**
- ✅ **Packaging trivial**
- ✅ **Control total**
- ✅ **Usa Ollama local (gratis)**

Desventajas:
- ⏱️ 8-11 semanas desarrollo
- 🧠 Necesita reimplementar algoritmos PageIndex

**Recomendación:** ⭐⭐⭐ **Sigue siendo la mejor opción a largo plazo**

---

## Recomendación Final Actualizada

### Path A: Validación Rápida con PageIndex Oficial

**Si quieres probar PageIndex YA:**

```
Semana 1-2:
  ├─ Implementar ZeroRPC prototipo
  ├─ Integrar PageIndex Python
  ├─ Testing con PDFs reales
  └─ Benchmarking vs LanceDB

Decisión: ¿PageIndex vale la pena?
  ├─ SÍ → Migrar a MCP (Semana 3-4)
  └─ NO → Continuar con LanceDB
```

**Tiempo total:** 2-4 semanas para validación completa

---

### Path B: Implementación Nativa desde Cero

**Si quieres control total sin Python:**

```
Fase 1-5:
  ├─ Database schema (2 semanas)
  ├─ Tree builder TypeScript (3 semanas)
  ├─ Reasoning search (2 semanas)
  └─ UI + Testing (2 semanas)

Total: 8-11 semanas
```

**Pros:**
- No dependency hell
- Funciona offline
- Zero Python issues

**Cons:**
- Toma más tiempo
- Necesita validar algoritmos

---

## Propuesta Concreta

**Recomiendo Path A (Validación):**

1. **Esta semana:** Prototipo ZeroRPC + PageIndex
   - Usar electron-zerorpc-example como base
   - Integrar PageIndex Python
   - Probar con 5-10 PDFs

2. **Próxima semana:** Benchmarking
   - Comparar precisión vs LanceDB
   - Medir latencia
   - Evaluar costos API OpenAI

3. **Decisión basada en datos:**
   - Si PageIndex > 10% mejor → Migrar a MCP
   - Si PageIndex no impresiona → Path B (TypeScript nativo)

**Ventajas:**
- ✅ Decisión informada (no especular)
- ✅ Rápido (2 semanas para saber)
- ✅ Bajo riesgo (prototipo descartable)
- ✅ Aprender si PageIndex realmente es mejor

---

## Código de Ejemplo: ZeroRPC + PageIndex

### 1. Install Dependencies

```bash
# System (Ubuntu/Debian)
sudo apt-get install libzmq3-dev

# Python
cd electron
python3 -m venv pageindex-env
source pageindex-env/bin/activate
pip install zerorpc
pip install git+https://github.com/VectifyAI/PageIndex.git

# Node
npm install zerorpc
```

### 2. Python Server (electron/pageindex-server.py)

```python
import zerorpc
import sys
import os

# PageIndex imports
# from pageindex import PageIndex (cuando esté instalado)

class PageIndexService:
    def __init__(self):
        self.indexed_docs = {}
        print("[PageIndex] Server initialized")

    def ping(self):
        """Health check"""
        return "pong"

    def build_tree(self, pdf_path):
        """Build hierarchical tree for document"""
        print(f"[PageIndex] Building tree for: {pdf_path}")

        # TODO: Usar PageIndex real
        # tree = PageIndex.build(pdf_path)

        # Mock por ahora
        tree = {
            "id": "tree-123",
            "title": "Document Title",
            "summary": "Mock tree for testing",
            "children": []
        }

        return tree

    def search(self, query, doc_id):
        """Search with reasoning"""
        print(f"[PageIndex] Search: {query} in {doc_id}")

        # TODO: Usar PageIndex real
        # results = PageIndex.search(query, doc_id)

        # Mock
        results = {
            "success": True,
            "results": [
                {
                    "title": "Relevant Section",
                    "pages": "10-15",
                    "summary": "Mock result",
                    "relevance": 0.95
                }
            ],
            "reasoning": [
                "Analyzed query",
                "Found relevant section"
            ]
        }

        return results

def main():
    server = zerorpc.Server(PageIndexService())
    server.bind("tcp://0.0.0.0:4242")
    print("[PageIndex] Server running on tcp://0.0.0.0:4242")
    server.run()

if __name__ == "__main__":
    main()
```

### 3. Electron Main (electron/main.cjs - añadir)

```javascript
const zerorpc = require("zerorpc");
const { spawn } = require("child_process");
const path = require("path");

let pythonProcess = null;
let zerorpcClient = null;

/**
 * Start PageIndex Python server
 */
function startPageIndexServer() {
  console.log('[PageIndex] Starting Python server...');

  const pythonPath = path.join(__dirname, 'pageindex-env', 'bin', 'python3');
  const serverPath = path.join(__dirname, 'pageindex-server.py');

  pythonProcess = spawn(pythonPath, [serverPath]);

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[PageIndex Server] ${data}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`[PageIndex Server Error] ${data}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`[PageIndex] Server exited with code ${code}`);
  });

  // Connect ZeroRPC client
  setTimeout(() => {
    zerorpcClient = new zerorpc.Client();
    zerorpcClient.connect("tcp://127.0.0.1:4242");
    console.log('[PageIndex] Connected to Python server');
  }, 2000); // Wait 2s for server to start
}

/**
 * Stop PageIndex server
 */
function stopPageIndexServer() {
  if (zerorpcClient) {
    zerorpcClient.close();
  }
  if (pythonProcess) {
    pythonProcess.kill();
  }
}

// IPC Handlers
ipcMain.handle('pageindex:build-tree', async (event, pdfPath) => {
  return new Promise((resolve, reject) => {
    zerorpcClient.invoke("build_tree", pdfPath, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
});

ipcMain.handle('pageindex:search', async (event, query, docId) => {
  return new Promise((resolve, reject) => {
    zerorpcClient.invoke("search", query, docId, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
});

// En app ready
app.on('ready', () => {
  startPageIndexServer();
  createMainWindow();
});

// En app quit
app.on('quit', () => {
  stopPageIndexServer();
});
```

### 4. Preload (electron/preload.cjs - añadir)

```javascript
// En ALLOWED_CHANNELS
const ALLOWED_CHANNELS = {
  invoke: [
    // ... existing
    'pageindex:build-tree',
    'pageindex:search',
  ],
  // ...
};

// En window.electron
contextBridge.exposeInMainWorld('electron', {
  // ... existing
  pageindex: {
    buildTree: (pdfPath) =>
      ipcRenderer.invoke('pageindex:build-tree', pdfPath),
    search: (query, docId) =>
      ipcRenderer.invoke('pageindex:search', query, docId),
  },
});
```

### 5. Renderer Usage

```typescript
// En componente React
async function testPageIndex() {
  try {
    // Build tree
    const tree = await window.electron.pageindex.buildTree('/path/to/doc.pdf');
    console.log('Tree:', tree);

    // Search
    const results = await window.electron.pageindex.search(
      'What is machine learning?',
      'doc-123'
    );
    console.log('Results:', results);
  } catch (error) {
    console.error('PageIndex error:', error);
  }
}
```

---

## Próximos Pasos Concretos

**Si decides probar ZeroRPC:**

1. [ ] Instalar dependencias (ZMQ + zerorpc)
2. [ ] Crear `pageindex-server.py` con mocks
3. [ ] Añadir código ZeroRPC a `main.cjs`
4. [ ] Actualizar `preload.cjs`
5. [ ] Probar con PDF de ejemplo
6. [ ] Integrar PageIndex real
7. [ ] Benchmarking

**Tiempo estimado:** 2-3 días para prototipo funcional

**¿Quieres que implemente el prototipo ZeroRPC?**

---

## Referencias

### ZeroRPC
- [electron-zerorpc-example](https://github.com/pazrul/electron-zerorpc-example)
- [zerorpc-python](https://github.com/0rpc/zerorpc-python)
- [zerorpc-node](https://github.com/0rpc/zerorpc-node)
- [Electron-Python integration guide](https://medium.com/@abulka/electron-python-4e8c807bfa5e)

### MCP
- [MCP alternatives 2026](https://www.merge.dev/blog/model-context-protocol-alternatives)
- [MCP Complete Guide](https://publicapis.io/blog/mcp-model-context-protocol-guide)
- [Best MCP Servers 2026](https://cybersecuritynews.com/best-model-context-protocol-mcp-servers/)

### Comparación
- Issue #95: [Packaging problems zerorpc](https://github.com/0rpc/zerorpc-node/issues/95)
