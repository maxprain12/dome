# Guía de instalación inicial con Ollama como proveedor de IA

Esta guía te ayudará a configurar **Ollama** como proveedor de IA local en Dome, permitiéndote usar modelos de lenguaje sin depender de API keys ni servicios en la nube.

---

## Requisitos previos

- **Dome** instalado ([ver instalación principal](../README.md#installation))
- Conexión a internet para descargar Ollama y los modelos (solo la primera vez)
- Espacio en disco: ~4–8 GB según los modelos elegidos
- **Windows**: Windows 10/11 de 64 bits  
- **macOS**: macOS 11+ (Intel o Apple Silicon)  
- **Linux**: distribución compatible con AppImage o instalación manual

---

## 1. Instalar Ollama

### Windows

1. Descarga el instalador desde [ollama.com/download](https://ollama.com/download)
2. Ejecuta `OllamaSetup.exe` y sigue el asistente
3. Ollama se inicia automáticamente en segundo plano (puerto 11434)

### macOS

```bash
# Con Homebrew
brew install ollama

# O descarga directa desde ollama.com/download
```

Después de instalar, abre la app Ollama desde Aplicaciones.

### Linux

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama serve  # Si no corre como servicio
```

---

## 2. Configurar Ollama (recomendado)

Abre **Ollama** → **Settings** y ajusta lo siguiente:

| Opción | Valor recomendado | Descripción |
|--------|-------------------|-------------|
| **Expose Ollama to the network** | Apagado (OFF) | Mantiene Ollama solo en tu máquina; Dome accede por localhost |
| **Model location** | `C:\Users\<usuario>\.ollama\models` (Windows) / `~/.ollama/models` (macOS/Linux) | Ruta donde se guardan los modelos |
| **Context length** | **256k** | Mayor contexto para respuestas largas y búsqueda semántica |
| **Airplane mode** | Apagado (OFF) | Necesario para descargar modelos; apagar solo si quieres máxima privacidad offline |

Guarda los cambios con **Saved**.

---

## 3. Descargar los modelos necesarios

Necesitas dos modelos: uno para **chat** y otro para **embeddings** (búsqueda semántica).

**Importante:** El modelo `glm-5:cloud` requiere que te registres en Ollama y tengas una cuenta. Debes iniciar sesión en la app de Ollama (Settings → tu perfil o Sign in) para poder usarlo.

Abre una terminal y ejecuta:

```bash
# Modelo de chat (GLM-5 Cloud, recomendado para conversación)
# Requiere cuenta Ollama e iniciar sesión en la app
ollama pull glm-5:cloud

# Modelo de embeddings (búsqueda semántica en Dome)
ollama pull mxbai-embed-large:latest
```

Para ver los modelos instalados:

```bash
ollama list
```

Deberías ver líneas similares a:

```
NAME                      ID              SIZE
glm-5:cloud               abc123...       2.5 GB
mxbai-embed-large:latest  def456...       670 MB
```

---

## 4. Configurar Dome para usar Ollama

1. Abre **Dome**
2. Ve a **Settings** (icono engranaje) → **AI**
3. En **Provider**, selecciona **Ollama**
4. Configura estos valores:

### Configuración básica

| Campo | Valor |
|-------|-------|
| **Base URL** | `http://localhost:11434` |
| **Chat Model** | `glm-5:cloud` (usa Refresh si no aparece) |
| **Embedding Model** | `mxbai-embed-large:latest` |

### Ajuste fino (Fine tuning)

| Parámetro | Valor recomendado | Descripción |
|-----------|-------------------|-------------|
| **Temperature** | `0.7` | Creatividad vs consistencia (0 = más determinista) |
| **Top P** | `0.9` | Muestra las respuestas más probables |
| **Num Predict** | `4000` | Tokens máximos por respuesta |
| **Show thinking** | OFF | Desactivado para no mostrar razonamiento interno (chain-of-thought) |

5. Haz clic en **Refresh** junto a Chat Model para cargar los modelos disponibles
6. Guarda los cambios

---

## 5. Comprobar que todo funciona

1. **Ollama en ejecución**: En la bandeja del sistema (Windows) o barra de menú (macOS) debe verse el icono de Ollama
2. **Prueba rápida**: En Dome, abre el asistente **Many** (botón flotante) y haz una pregunta
3. **Búsqueda semántica**: Usa `Cmd/Ctrl + K` y busca algo en lenguaje natural

Si Ollama no está corriendo, Dome indicará que no puede conectar con el proveedor.

---

## Resumen de configuración

### Ollama

- Base URL: `http://localhost:11434`
- Expose to network: OFF
- Context length: 256k
- Modelos: `glm-5:cloud` (chat), `mxbai-embed-large:latest` (embeddings)

### Dome

- Provider: Ollama
- Chat Model: `glm-5:cloud` (requiere cuenta Ollama e iniciar sesión en la app)
- Embedding Model: `mxbai-embed-large:latest`
- Temperature: 0.7  
- Top P: 0.9  
- Num Predict: 4000  
- Show thinking: OFF  

---

## Solución de problemas

### "Ollama no disponible" en Dome

- Comprueba que Ollama está en ejecución (icono en bandeja/menú)
- Comprueba que el puerto 11434 no está bloqueado: `curl http://localhost:11434/api/tags` (debe devolver JSON)
- En **Settings** → **AI**, verifica que Base URL sea `http://localhost:11434`

### Los modelos no aparecen en Dome

- Ejecuta `ollama list` para ver los modelos instalados
- Usa el botón **Refresh** junto a Chat Model
- Asegúrate de haber descargado ambos modelos: `ollama pull glm-5:cloud` y `ollama pull mxbai-embed-large`

### Búsqueda semántica lenta o falla

- El modelo `mxbai-embed-large` debe estar descargado y cargado
- Con Ollama local, la primera búsqueda puede tardar mientras carga el modelo

### Otros modelos recomendados (alternativas)

| Uso | Modelo | Comando | Notas |
|-----|--------|---------|-------|
| Chat (recomendado) | GLM-5 Cloud | `ollama pull glm-5:cloud` | **Requiere cuenta Ollama e iniciar sesión en la app** |
| Chat (más ligero) | Llama 3.2 | `ollama pull llama3.2` | Sin registro |
| Chat (más potente) | Qwen 2.5 | `ollama pull qwen2.5` | Sin registro |
| Embeddings (alternativa) | nomic-embed-text | `ollama pull nomic-embed-text` | Sin registro |

---

## Siguientes pasos

- [Uso del asistente Many](./ai-chat.md)
- [Búsqueda con Cmd+K](./command-center.md)
- [Configuración general](./settings.md)
