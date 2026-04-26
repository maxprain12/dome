# Observabilidad local (opcional)

- **Objetivo**: ofrecer señal estructurada (OTLP) para agentes en desarrollo, alineado con el bucle *query → razonar → arreglar* del post de Codex.
- **Contenedor**: ajusta `docs/observability/docker-compose.yml` y `vector.yaml` a tu entorno; no hay un único despliegue obligatorio en CI.
- **Siguiente paso** típico: añadir export OTLP desde el proceso main (Node) o desde un *bridge* IPC que reenvíe eventos.
