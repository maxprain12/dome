#!/bin/bash
# Script para eliminar las bases de datos SQLite y LanceDB
# Esto reinicia la aplicación desde cero

USER_DATA_DIR="$HOME/Library/Application Support/Dome"

echo "🗑️  Eliminando bases de datos..."
echo "📁 Directorio: $USER_DATA_DIR"
echo ""

# Verificar que el directorio existe
if [ ! -d "$USER_DATA_DIR" ]; then
  echo "❌ El directorio de datos no existe: $USER_DATA_DIR"
  exit 1
fi

# Eliminar SQLite database
echo "📦 Eliminando base de datos SQLite..."
rm -f "$USER_DATA_DIR/dome.db"
rm -f "$USER_DATA_DIR/dome.db-shm"
rm -f "$USER_DATA_DIR/dome.db-wal"
echo "✅ Archivos SQLite eliminados"

# Eliminar LanceDB
echo "🔮 Eliminando base de datos LanceDB..."
rm -rf "$USER_DATA_DIR/dome-vector"
echo "✅ Directorio LanceDB eliminado"

echo ""
echo "✅ ¡Bases de datos eliminadas!"
echo "🚀 Reinicia la aplicación"
echo ""
echo "Nota: Los archivos en dome-files/ NO se eliminan"
echo "      Si quieres eliminar todo, ejecuta también:"
echo "      rm -rf \"$USER_DATA_DIR/dome-files\""
