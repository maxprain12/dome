#!/bin/bash

# Script para limpiar datos de desarrollo
# Ejecutar con: npm run clean

echo "🧹 Limpiando datos de desarrollo de Dome..."
echo ""

# Detectar el sistema operativo
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    DATA_DIR="$HOME/Library/Application Support/Dome"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows
    DATA_DIR="$APPDATA/Dome"
else
    # Linux
    DATA_DIR="$HOME/.config/Dome"
fi

echo "📍 Directorio de datos: $DATA_DIR"
echo ""

if [ -d "$DATA_DIR" ]; then
    echo "⚠️  ¿Estás seguro de que quieres eliminar TODOS los datos?"
    echo "   Esto eliminará:"
    echo "   - Base de datos SQLite"
    echo "   - Base de datos vectorial"
    echo "   - Todos los archivos de usuario"
    echo ""
    read -p "Escribe 'SI' para confirmar: " confirm

    if [ "$confirm" = "SI" ]; then
        rm -rf "$DATA_DIR"
        echo "✅ Datos eliminados correctamente"
        echo ""
        echo "Para crear nuevos datos, ejecuta:"
        echo "  npm run test:db"
    else
        echo "❌ Operación cancelada"
    fi
else
    echo "ℹ️  No hay datos para limpiar"
fi

echo ""
