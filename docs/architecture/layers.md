# Capas (modelo de referencia)

Dirección permitida (dependencias hacia *adelante* en el flujo de datos):

```text
Types → Config → Repo → Service → Runtime → App wiring + UI
```

- **Utils** (fuera del dominio) alimenta **Providers** (cross-cutting: auth, telemetría, etc.) con bordes explícitos.
- **Providers** inyecta capacidades en **Service** y en **App wiring + UI**, no a la inversa de forma circunscrita a reglas de `dependency-cruiser` en el repo.

La configuración vive en [`.dependency-cruiser.cjs`](../../.dependency-cruiser.cjs). Los hallazgos de capas se auditan con el foco `arch` (VPS) y `depcruise` en CI.
