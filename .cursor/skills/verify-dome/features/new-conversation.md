# Nueva conversación

El botón de la barra de pestañas abre un chat nuevo.

## Sub-features

- `conversation-open` crea una pestaña de chat desde el botón de nueva conversación.

## How to get to it (user POV)

- Botón «Nueva conversación» en la barra de pestañas, a la derecha de las pestañas.

## Driving it with verify-dome

Preconditions:

- `doctor` imprime `ok`.
- El asistente de primer arranque no tapa la barra de pestañas. Si el clic falla por el overlay, termina el asistente en modo local como describe [projects.md](./projects.md) y repite el clic. No uses una cuenta real.

- **Abrir chat.** Run `node .cursor/skills/verify-dome/bin/verify.mjs click --role button --name '/nueva conversación|new conversation/i'`.
- **Pestaña.** Run `node .cursor/skills/verify-dome/bin/verify.mjs see --role tab --name '/conversación|conversation|chat/i' --out .verify-evidence/new-conversation/new-conversation.txt`. Hay una pestaña de chat seleccionada.
- **Proof.** Run `node .cursor/skills/verify-dome/bin/verify.mjs shot --selector '#root' --out .verify-evidence/new-conversation/new-conversation.png`.

## Gotchas

- El nombre del botón es «Nueva conversación» en español, no «Nuevo chat».
- El clic no es válido si el asistente de primer arranque intercepta el puntero. No uses un clic forzado.
