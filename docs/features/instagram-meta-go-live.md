# Instagram / Meta — qué falta para usuarios nuevos y cómo no romper OAuth

Guía operativa de **Dome IA** (`1310519154571859`, producto Instagram **Dome-IG** `1402064921780132`). No cubre Sendit. No hace falta **dome-provider** para conectar una cuenta.

Publicar fotos/vídeos locales sigue siendo otro problema (Graph exige una URL `https` pública). Este documento es solo **login + App Review**.

---

## Estado actual (2026-09-11)

| Pieza | Estado |
| ----- | ------ |
| App canónica | **Dome IA**, Live / Publicada |
| Redirect Instagram Login a registrar | `https://dome.dowi.es/oauth/instagram/callback` |
| Código Dome | Instagram authorize + token exchange usan esa URI; el servidor local sigue en `127.0.0.1:<puerto>/callback/instagram` |
| Landing | Rutas aisladas en `landing-page-dome`: `/oauth/instagram/callback`, `/deauthorize`, `/data-deletion` (no tocan Hero/Nav) |
| Deauthorize / data deletion | GET páginas + POST `200` vía `scripts/serve.mjs` |
| App Review / Tech Provider | Sigue pendiente (política Meta; no es el callback) |

---

## 1. Qué hay que rellenar (checklist Meta)

Orden real. Saltar un paso suele bloquear el siguiente.

### A. Limpieza (5 min)

1. Confirmar el diálogo **¿Suprimir Dome?** de la app duplicada (Meta pide la contraseña de Facebook). No borrar **Dome IA** ni **Sendit**.
2. En Dome escritorio, Ajustes → Social → Instagram: **Instagram App ID** = `1402064921780132` (el de Dome-IG), no el App ID de Facebook `1310519154571859`. El secret es el de Instagram, el botón «Mostrar» en Casos de uso → API con Instagram Login.

### B. URLs que App Review suele exigir

En **Casos de uso → API de Instagram → Configurar inicio de sesión empresarial** (y, si aparece, en Facebook Login → Configuración):

| Campo | Qué poner | Notas |
| ----- | --------- | ----- |
| **OAuth redirect URI** | `https://dome.dowi.es/oauth/instagram/callback` | Ver §2. Quitar o no usar `http://localhost…` (Meta lo rechaza en Live). `https://localhost…` se puede dejar como extra, no sirve para el flujo automático. |
| **Deauthorize callback** | `https://dome.dowi.es/oauth/instagram/deauthorize` | Meta hace POST cuando el usuario revoca. Puede ser una página estática que responde 200; lo ideal es un endpoint que reciba el `signed_request`. |
| **Data deletion request URL** | `https://dome.dowi.es/privacy` (o `/oauth/instagram/data-deletion`) | Instrucciones visibles de cómo pedir el borrado. App Review falla si solo hay un 404. |

Privacy y ToS ya están. No hace falta dome-provider: son páginas del sitio.

### C. Verificación de empresa (bloquea Advanced Access)

Panel de la app → **Hazte proveedor de tecnología** / Business Verification.

Hace falta, en el Business Manager ligado a Dome IA:

- Nombre legal, dirección, teléfono de la empresa
- Documento (escritura, certificado fiscal, extracto bancario… lo que Meta pida en el país)
- Dominio `dome.dowi.es` verificado en el portfolio (DNS o meta tag)
- Correo de contacto de la app verificado (el del dashboard)

Hasta que `business_verification_passes` sea true, App Review no concede Advanced Access.

### D. Tech Provider

Para **clientes que no son testers ni admins** Meta trata la app como Tech Provider: software de terceros que opera cuentas Instagram ajenas.

Completar el cuestionario (qué datos se piden, para qué, retención, DPA). Sin esto, Live + Standard Access = solo cuentas con rol en la app.

### E. App Review → Advanced Access

Enviar **un solo** review con los permisos que Dome pide de verdad:

| Permiso | Para qué en Dome | Advanced Access |
| ------- | ---------------- | ---------------- |
| `instagram_business_basic` | Identidad, perfil, listar media | Obligatorio |
| `instagram_business_content_publish` | Publicar feed / Reels / carrusel | Obligatorio |
| `instagram_business_manage_insights` | KPIs, informes | Obligatorio |
| `instagram_business_manage_comments` | Bandeja de comentarios | Si el producto lo ofrece |
| `instagram_business_manage_messages` | DMs | Si el producto lo ofrece |

Material que hay que preparar (no se puede fingir desde el dashboard):

1. **Screencast** (una toma, audio o subtítulos): abrir Dome → Conectar Instagram → consentimiento Meta → cuenta aparece → publicar un post de prueba → ver métricas. Cuenta de prueba profesional, no personal.
2. Texto del caso de uso: editor de escritorio para cuentas Instagram profesionales; el usuario inicia sesión en su máquina; Dome no es una agencia que opera páginas ajenas sin consentimiento.
3. Botón de login acorde a la [marca Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/).
4. La app tiene que ser **probada desde fuera** por el reviewer. En escritorio: build o instrucciones + usuario de prueba. Intranet / solo testers internos → rechazo.

Standard Access (lo que hay ahora) **no** se “abre” al publicar la app. Live ≠ Advanced.

### F. Lo que Meta no va a dar (aunque el review pase)

- **Borrar un post publicado** con Instagram Login: `DELETE /{ig-media-id}` es de Facebook Login (`graph.facebook.com` + `instagram_manage_contents`). Dome usa `graph.instagram.com`. El borrado de biblioteca es solo local.
- **Biblioteca de música** nativa: no hay API pública equivalente a la app móvil.
- **Búsqueda de ubicaciones**: a menudo 400 / vacío con Instagram Login.

---

## 2. Por qué `http://localhost:8737/callback/instagram` falla

Dome hoy (`electron/social/social-oauth.cjs`):

1. Levanta un servidor HTTP en `127.0.0.1:<puerto>` (por defecto 8737).
2. Abre el navegador en `https://www.instagram.com/oauth/authorize?redirect_uri=http://localhost:8737/callback/instagram&…`.
3. Instagram redirige al loopback con `?code=`.
4. El proceso main intercambia el code. El `redirect_uri` del POST tiene que ser **el mismo string** que en el authorize.

Eso es el [RFC 8252 loopback](https://datatracker.ietf.org/doc/html/rfc8252#section-7.3). LinkedIn y X lo aceptan. **Instagram Business Login, con la app Live, no.**

Lo que vimos en el dashboard:

- Guardar `http://localhost:8737/callback/instagram` → *«Error al guardar los URI de redireccionamiento»*.
- Guardar `https://localhost:8737/callback/instagram` → OK.

Causas (las dos a la vez):

1. El formulario de Instagram Login **exige HTTPS** en Live. No es un permiso que se pueda marcar.
2. Meta **intenta validar** la URL. `http://localhost` no es alcanzable desde sus servidores.

### Por qué `https://localhost` también rompe el flujo de Dome

Si registramos HTTPS y Dome sigue hablando HTTP:

| Paso | Qué pasa |
| ---- | -------- |
| Authorize con `https://localhost:8737/…` | Instagram redirige a HTTPS |
| Servidor de Dome | `http.createServer` → el navegador muestra `ERR_SSL_PROTOCOL_ERROR` |
| Authorize con `http://localhost:8737/…` | Instagram rechaza: URI no está en la lista (o la lista no admite `http://`) |

Hacer el servidor local en TLS (certificado autofirmado) obliga al usuario a saltarse el aviso de Chrome. No es aceptable en un producto instalable.

**dome-provider no arregla esto.** El callback tiene que volver a la máquina del usuario. Un backend en la nube solo serviría si el code viaja nube → escritorio (más infra, más secretos, no lo queremos aquí).

---

## 3. Cómo hacerlo sin fallar y sin dome-provider

**Página de rebote HTTPS en el sitio** (`landing-page-dome` / `dome.dowi.es`). Estática. Sin API, sin SQLite, sin provider.

```
Usuario pulsa Conectar en Dome
        │
        ▼
Navegador → instagram.com/oauth/authorize
            redirect_uri = https://dome.dowi.es/oauth/instagram/callback
        │
        ▼
Instagram redirige (HTTPS, público, Meta puede validarlo)
  https://dome.dowi.es/oauth/instagram/callback?code=…&state=…#_
        │
        ▼
HTML estático: quita #_, comprueba host local, redirige a
  http://127.0.0.1:<puerto>/callback/instagram?code=…&state=…
        │
        ▼
Servidor HTTP que Dome ya levanta → intercambio del code
  (redirect_uri del POST = https://dome.dowi.es/oauth/instagram/callback)
```

El code viaja Instagram → sitio (HTTPS) → localhost (solo en esa máquina). El POST del token lo hace Electron, no el navegador y no el provider.

### Por qué el `redirect_uri` del token no es localhost

OAuth exige el **mismo** URI en authorize y en el intercambio. El rebote es solo transporte del `code`. Si el POST usara `http://localhost:…`, Instagram respondería `redirect_uri mismatch`.

### Puerto distinto de 8737

Hoy el usuario puede cambiar el puerto en Ajustes. El URI registrado en Meta es fijo; el puerto local no puede ir en ese URI.

Meter el puerto en `state` (ya es un nonce opaco):

```text
state = base64url( json { n: "<nonce>", p: 8737 } )
```

La página de rebote lee `p` y redirige a ese puerto. Dome sigue comprobando el nonce. Si `p` falta, 8737.

### Página estática (contrato)

Archivo en el sitio, p. ej. `public/oauth/instagram/callback.html` (o ruta Astro equivalente). Meta, al guardar el URI, hace GET: tiene que devolver **200**.

Comportamiento:

1. Leer `code` y `state` de la query. Ignorar el fragmento `#_` que Instagram añade.
2. Decodificar `state` → puerto. Solo `8737–65535`.
3. `location.replace('http://127.0.0.1:' + port + '/callback/instagram?' + query)`.
4. Si a los ~2 s no hay respuesta (Dome cerrado): mensaje «Abre Dome y vuelve a Conectar». Nunca redirigir a un host que no sea `127.0.0.1` o `localhost`.

Opcional en el mismo sitio (sin backend):

- `/oauth/instagram/deauthorize` → 200 vacío o “revocación recibida”.
- `/oauth/instagram/data-deletion` → texto que apunte a Ajustes → Social → Desconectar + contacto.

### Cambio en Dome

En `electron/social/social-oauth.cjs`, solo Instagram:

- `authorize` + `exchangeCode` usan `https://dome.dowi.es/oauth/instagram/callback`.
- El servidor local **sigue en HTTP** en `127.0.0.1:<puerto>` y acepta `/callback/instagram`.
- `state` incluye puerto + nonce.
- Antes de abrir el navegador, Dome hace GET a la página de rebote. Si aún no está desplegada (404 / red), **no** cae a `http://localhost` — falla con un error accionable.
- LinkedIn y X no se tocan.

### Qué no hacer

| Idea | Por qué no |
| ---- | ---------- |
| TLS local autofirmado | Aviso de certificado o `ERR_SSL_PROTOCOL_ERROR` |
| `https://localhost` en Meta y HTTP en Dome | El navegador no completa el redirect |
| Volver la app a Development | `http://localhost` quizá vuelva, pero **todo el mundo** otra vez tester |
| Recibir el code en dome-provider | Infra de más; el escritorio igual tiene que enterarse |
| Custom scheme `dome://` | Instagram Login no lo admite |
| Pegar el token a mano | Ya existe como escape; no es el flujo de usuarios nuevos |

---

## 4. Orden de trabajo recomendado

1. Desplegar `landing-page-dome` (rutas `/oauth/instagram/*` ya están en el repo; no dependen del rediseño de la home).
2. En Meta, sustituir el redirect por `https://dome.dowi.es/oauth/instagram/callback`. Deauthorize = `/oauth/instagram/deauthorize`. Data deletion = `/oauth/instagram/data-deletion`.
3. Probar Conectar en Dome con una cuenta que **sí** tiene rol (ad.vo2 / dome_ia). Si la landing aún no está en producción, Dome **no** abre Instagram: muestra el error de probe.
4. Completar Business Verification + Tech Provider.
5. Screencast y envío de App Review (Advanced Access).
6. Cuando Meta apruebe: un usuario sin rol en la app puede conectar.

Hasta el paso 6, “usuarios nuevos sin testers” es imposible por política de Meta, no por el callback.

---

## 5. IDs y rutas de dashboard

| Qué | Valor |
| --- | ----- |
| Facebook App | Dome IA · [dashboard](https://developers.facebook.com/apps/1310519154571859/dashboard/) |
| Instagram App | Dome-IG `1402064921780132` |
| Redirect a registrar | Casos de uso → Personalizar → API con Instagram Login → paso «inicio de sesión empresarial» |
| Review | Acciones requeridas / App Review |
| Verificación | Business Manager del mismo portfolio |

Cliente OAuth: el **Instagram App ID + secret de Dome-IG**, no el App ID de Facebook.

---

## Referencias

- [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/)
- [App Review (Instagram Platform)](https://developers.facebook.com/docs/instagram-platform/app-review/)
- [Access levels](https://developers.facebook.com/docs/instagram-platform/overview/)
- Código actual: `electron/social/social-oauth.cjs`
- Hub: [social-hub.md](social-hub.md)
