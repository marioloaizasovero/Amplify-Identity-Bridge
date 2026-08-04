# Amplify Identity Bridge

Puente OAuth entre Amazon Cognito y una tienda VTEX. La aplicación está
construida con Next.js 15 y utiliza AWS Amplify Gen 2 para desplegar una
función Lambda y una tabla DynamoDB.

## Estado actual

El flujo principal Cognito → Bridge → VTEX está implementado:

- Callback OAuth para el flujo iniciado directamente en Cognito.
- Intercambio del authorization code en una Lambda.
- Validación del ID token, firma, issuer, audience, `token_use` y correo
  verificado.
- Sesión temporal del bridge mediante una cookie `HttpOnly`.
- Endpoints OAuth consumidos por VTEX: `authorize`, `token` y `userinfo`.
- Códigos de autorización y access tokens aleatorios, temporales y de un solo
  uso cuando corresponde.
- Persistencia de estados, sesiones y hashes en DynamoDB con TTL.
- Redirección automática al login de VTEX.

Las APIs de VTEX están desarrolladas y técnicamente listas. Todavía requieren
despliegue, configuración del proveedor OAuth y pruebas integrales con una
cuenta real de VTEX.

Las rutas y páginas dummy `/vtex`, `/vtex/start`, `/vtex/callback`,
`/api/auth/vtex/start` y `/api/auth/vtex/callback` fueron eliminadas. La página
`/vtex/error` se conserva porque es el destino actual de los errores
controlados, aunque su interfaz sigue pendiente de diseño.

## Arquitectura

```text
Navegador
  |
  | Inicio directo en Cognito
  v
Amazon Cognito
  |
  | callback con code
  v
GET /api/auth/cognito/callback
  |-- genera correlationId
  |-- invoca cognito-token-exchange --------------> Lambda
  |                                                   |
  |                                                   |-- POST /oauth2/token
  |                                                   |-- valida ID token/JWKS
  |                                                   v
  |                                                Cognito
  |-- guarda sesión temporal del bridge ----------> DynamoDB
  |-- crea cookie HttpOnly
  |-- redirige a /login?oAuthRedirect=...
  v
VTEX
  |
  | GET /api/auth/vtex/authorize
  | POST /api/auth/vtex/token
  | GET /api/auth/vtex/userinfo
  v
Sesión VTEX
```

## Flujos de autenticación

### 0. Inicio silencioso desde la página del bridge

1. El usuario abre `GET /start` y selecciona **Continuar con Cognito**.
2. El navegador abre directamente el endpoint Cognito `/oauth2/authorize` con
   `response_type=code`, el callback del bridge y `prompt=none`.
3. Si existe una sesión Cognito vigente, Cognito retorna un authorization code
   al callback y continúa el flujo normal.
4. Si no existe una sesión, Cognito retorna `login_required` sin mostrar una
   pantalla de credenciales.

La página no utiliza una API intermedia, no crea cookies y no escribe en
DynamoDB. El Client Secret de Cognito nunca forma parte de la URL.

### 1. Callback de Cognito

1. El usuario inicia la autenticación directamente en Cognito.
2. Cognito retorna al callback configurado con el authorization code.
3. El bridge genera un `correlationId` e invoca la Lambda.
4. La Lambda intercambia el código, obtiene las claves JWKS y valida el ID
   token.
5. El bridge conserva únicamente los claims mínimos:
   `sub`, `email`, `emailVerified`, `name` y `username`.
6. El bridge crea una sesión temporal y una cookie `HttpOnly`.
7. Con el modo debug desactivado, redirige automáticamente al login de VTEX.

### 2. Autorización OAuth para VTEX

1. VTEX solicita `GET /api/auth/vtex/authorize` con `client_id`, `state` y
   `redirect_uri`.
2. El bridge valida exactamente el cliente, la URL de retorno y el `state`.
3. Si existe una sesión temporal, la consume y genera el authorization code.
4. Si no existe, guarda la solicitud VTEX por cinco minutos y redirige a
   Cognito con un `state` y `nonce` propios.
5. El callback valida y consume la solicitud pendiente, y la Lambda verifica
   el `nonce` del ID Token.
6. El bridge genera un authorization code de más de 64 caracteres y guarda
   solamente su hash SHA-256 durante cinco minutos.
7. Redirige a VTEX con `code` y exactamente el `state` original de VTEX.

### 3. Intercambio del código

1. VTEX ejecuta `POST /api/auth/vtex/token` con
   `Content-Type: application/x-www-form-urlencoded`.
2. El bridge valida `client_id`, `client_secret`, `code`, `redirect_uri` y
   `grant_type`.
3. El authorization code se consume de forma atómica, por lo que no puede
   reutilizarse.
4. El bridge genera un access token y guarda solamente su hash durante
   15 minutos.
5. VTEX recibe `access_token`, `expires_in` y `token_type`.

Las credenciales pueden recibirse en el body o mediante HTTP Basic. Si VTEX no
envía `grant_type`, el bridge asume `authorization_code`.

### 4. Información del usuario

1. VTEX ejecuta `GET /api/auth/vtex/userinfo`.
2. Envía el access token mediante `Authorization: Bearer <token>`.
3. El bridge valida el hash y la vigencia del token en DynamoDB.
4. Retorna:

```json
{
  "userId": "<sub-de-cognito>",
  "email": "usuario@toyota.cl",
  "name": "Nombre Usuario"
}
```

El envío del token en query string no está implementado y debe permanecer
desactivado en VTEX.

## Escenarios soportados

| Escenario | Estado |
| --- | --- |
| Login iniciado en Cognito y continuación automática hacia VTEX | Implementado |
| Login iniciado en VTEX cuando ya existe una sesión temporal del bridge | Implementado |
| Login iniciado en VTEX sin una sesión previa del bridge | Implementado |

La autorización pendiente se correlaciona mediante un `state` Cognito, una
cookie `HttpOnly` de cinco minutos y un registro temporal en DynamoDB. El
registro se consume atómicamente y no puede reutilizarse.

## Rutas vigentes

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/start` | Página con acceso directo a Cognito usando `prompt=none`. |
| `GET` | `/api/auth/cognito/callback` | Callback registrado en Cognito. |
| `GET` | `/api/auth/vtex/authorize` | Authorization endpoint consumido por VTEX. |
| `POST` | `/api/auth/vtex/token` | Intercambia el código por un access token. |
| `GET` | `/api/auth/vtex/userinfo` | Retorna la identidad asociada al access token. |
| `GET` | `/api/auth/vtex/logout` | Elimina la cookie temporal del bridge. No cierra las sesiones de VTEX o Cognito. |
| `GET` | `/cognito-debug` | Muestra el resultado temporal cuando el modo debug está habilitado. |
| `GET` | `/vtex-simulator/login` | Simula la página de login de una tienda VTEX. |
| `GET` | `/api/vtex-simulator/authorize` | Inicia la autorización desde la tienda simulada. |
| `GET` | `/api/vtex-simulator/callback` | Recibe el código y consume token y userinfo como lo haría VTEX. |
| `GET` | `/vtex-simulator/result` | Muestra la línea de tiempo y los datos recibidos por la tienda. |
| `GET` | `/vtex-credentials` | Genera credenciales OAuth para registrar en VTEX cuando la función está habilitada. |
| `GET` | `/vtex/error` | Página provisional para errores controlados. |

## Configuración en VTEX

Usando el dominio de desarrollo considerado actualmente:

```text
Authorization URL:
https://dummy-dev.bridge-vtex.toyota.cl/api/auth/vtex/authorize

Access Token URL:
https://dummy-dev.bridge-vtex.toyota.cl/api/auth/vtex/token

User Information URL:
https://dummy-dev.bridge-vtex.toyota.cl/api/auth/vtex/userinfo
```

La URL de retorno permitida es:

```text
https://vtexid.vtex.com.br/VtexIdAuthSiteKnockout/ReceiveAuthorizationCode.ashx
```

Configuración de campos:

```text
Client ID key:                    client_id
Client secret key:                client_secret
Authorization code response key: code
Authorization code request key:  code
Access token response key:       access_token
Token duration response key:     expires_in
Email response key:              email
User ID response key:            userId
User name response key:          name
Send access token:               Bearer header
Send in query string:            Disabled
```

La redirección automática desde el callback utiliza:

```text
VTEX_STORE_LOGIN_URL=https://<dominio-tienda>/login
VTEX_OAUTH_PROVIDER=ToyotaSSO
VTEX_RETURN_URL=/
```

El nombre de `VTEX_OAUTH_PROVIDER` debe coincidir exactamente con el proveedor
registrado en VTEX. `VTEX_RETURN_URL` solo admite una ruta interna que comience
con `/`.

## Recursos de infraestructura

El enfoque actual permite que Amplify Gen 2/CDK cree:

- Lambda `cognito-token-exchange`.
- Tabla DynamoDB con partition key `pk`, sort key `sk` y atributo TTL `ttl`.
- IAM SSR Compute role asumible por `amplify.amazonaws.com`.
- Políticas de mínimo privilegio para acceder a la tabla e invocar la Lambda.
- Outputs con el nombre físico de la tabla y de la Lambda, y el ARN del rol.

Los recursos se organizan en stacks separados:

```text
identity-bridge-state          → DynamoDB
cognito-token-exchange         → Lambda
identity-bridge-runtime-access → IAM SSR Compute role y políticas
```

Las políticas IAM utilizan referencias directas de CDK a `tableArn` y
`functionArn`. No contienen nombres físicos ni requieren actualizaciones
manuales cuando CloudFormation cambia el nombre de un recurso.

El rol otorga exclusivamente:

```text
dynamodb:GetItem
dynamodb:PutItem
dynamodb:DeleteItem
lambda:InvokeFunction
```

Después del primer despliegue de cada ambiente, el rol debe asociarse una sola
vez en:

```text
Amplify → App settings → IAM roles → Compute role
```

El ARN se publica en `amplify_outputs.json` como:

```text
custom.ssrComputeRoleArn
```

Los despliegues posteriores actualizan automáticamente las políticas del mismo
rol. No es necesario copiar nombres o ARN de DynamoDB y Lambda.

La tabla utiliza billing on-demand y actualmente tiene
`RemovalPolicy.DESTROY`. Esta política debe revisarse antes de utilizar el
proyecto en producción.

Si Infraestructura crea los recursos fuera de Amplify, será necesario adaptar
la lectura actual de outputs y la creación del rol para recibir los recursos
externos. Los permisos deben continuar limitados a los ARN específicos de cada
ambiente.

## Variables y secretos

### Backend de Amplify

Estas variables deben existir en Amplify para que
`ampx pipeline-deploy` pueda sintetizar el backend:

```text
COGNITO_CLIENT_ID
COGNITO_DOMAIN
COGNITO_REDIRECT_URI
COGNITO_USER_POOL_ID
```

El siguiente valor debe configurarse en **Hosting → Secrets** para la rama
correspondiente:

```text
COGNITO_CLIENT_SECRET
```

Los secretos creados para un sandbox local no se copian automáticamente a las
ramas desplegadas.

### Aplicación Next.js

Para una compilación de producción se requieren:

```text
BRIDGE_BASE_URL
COGNITO_CLIENT_ID
COGNITO_DOMAIN
COGNITO_REDIRECT_URI
COGNITO_SCOPES
BRIDGE_SESSION_TTL_SECONDS
VTEX_CLIENT_ID
VTEX_CLIENT_SECRET
VTEX_ALLOWED_REDIRECT_URI
VTEX_STORE_LOGIN_URL
VTEX_OAUTH_PROVIDER
VTEX_RETURN_URL
```

`AWS_REGION` es proporcionada por AWS durante el despliegue.
`ENABLE_COGNITO_DEBUG` es opcional y su valor predeterminado en producción es
`false`. `ENABLE_VTEX_CREDENTIAL_GENERATOR` y `ENABLE_VTEX_SIMULATOR` también
son opcionales, están deshabilitados de forma predeterminada y deben
habilitarse únicamente en ambientes de prueba.
`LOG_LEVEL` es opcional y su valor predeterminado es `info`. Los valores
aceptados son `error`, `warn`, `info` y `debug`.

Valores de referencia para desarrollo:

```text
BRIDGE_BASE_URL=https://dummy-dev.bridge-vtex.toyota.cl
COGNITO_CLIENT_ID=<app-client-id>
COGNITO_DOMAIN=https://<dominio-cognito>
COGNITO_REDIRECT_URI=https://dummy-dev.bridge-vtex.toyota.cl/api/auth/cognito/callback
COGNITO_SCOPES=openid email profile
BRIDGE_SESSION_TTL_SECONDS=900
ENABLE_COGNITO_DEBUG=false
ENABLE_VTEX_CREDENTIAL_GENERATOR=false
ENABLE_VTEX_SIMULATOR=false
LOG_LEVEL=info
VTEX_ALLOWED_REDIRECT_URI=https://vtexid.vtex.com.br/VtexIdAuthSiteKnockout/ReceiveAuthorizationCode.ashx
VTEX_RETURN_URL=/
```

`VTEX_CLIENT_SECRET` nunca debe enviarse al navegador ni escribirse en logs.
Actualmente la aplicación Next.js lo obtiene desde el entorno de ejecución.
Para producción se recomienda evaluar Secrets Manager o SSM con lectura en
runtime.

## Registros temporales en DynamoDB

| Registro | Uso | Lectura |
| --- | --- | --- |
| `bridge-session#<id>` | Claims validados y `correlationId` usados para autorizar a VTEX. | Consumo atómico |
| `vtex-pending#<hash>` | Solicitud VTEX pendiente, `state`, `nonce` y correlación con Cognito. | Consumo atómico |
| `vtex-code#<hash>` | Authorization code de cinco minutos con su `correlationId`. | Consumo atómico |
| `vtex-token#<hash>` | Access token de 15 minutos con su `correlationId`. | Lectura con validación de TTL |
| `session#<id>` | Resultado temporal, última etapa y diagnóstico de Lambda. | Consumo atómico |
| `vtex-simulator-state#<hash>` | Estado OAuth y sesión de la tienda simulada. | Consumo atómico |
| `vtex-simulator-result#<id>` | Etapas y respuesta final de la simulación. | Lectura con validación de TTL |

Los códigos y tokens originales no se guardan en DynamoDB; se persisten sus
hashes SHA-256 y los claims mínimos necesarios.

## Diagnóstico

Con:

```text
ENABLE_COGNITO_DEBUG=true
```

el flujo directo desde Cognito termina en `/cognito-debug` y no continúa
automáticamente hacia VTEX. La página consume el resultado temporal y deja de
estar disponible cuando el modo debug está deshabilitado. Muestra el resultado
de validación, los claims utilizados por el bridge, la última etapa, el
`correlationId`, el request ID de Lambda y los metadatos no sensibles del
token. El flujo iniciado por VTEX continúa hacia su callback para no romper la
sesión OAuth pendiente.

Los logs de la aplicación y de Lambda se escriben como JSON e incluyen
`event`, `stage` y `correlationId`. Para investigar un flujo:

1. Copiar el `Correlation ID` mostrado en `/cognito-debug`.
2. Buscar ese valor en los logs SSR de Amplify:
   `Amplify → Monitoring → Hosting compute logs`.
3. Usar el `Lambda Request ID` o el mismo `correlationId` en el grupo
   `/aws/lambda/<nombre-fisico-de-la-funcion>`.

Para habilitar el máximo detalle temporalmente:

```text
LOG_LEVEL=debug
ENABLE_COGNITO_DEBUG=true
```

Después de cambiar `LOG_LEVEL` se debe desplegar nuevamente: Amplify lo
incorpora a la aplicación SSR durante el frontend build y al entorno de la
Lambda durante el backend deploy.

Los eventos principales siguen este orden:

```text
cognito.callback.received
cognito.token_exchange.started
lambda.cognito_token_request.started
lambda.token_validation.completed
cognito.flow.completed
vtex.authorization.cognito_redirect
vtex.authorization.resumed
vtex.authorization.completed
vtex.token.completed
vtex.userinfo.completed
```

No se escriben deliberadamente en los logs `COGNITO_CLIENT_SECRET`,
`VTEX_CLIENT_SECRET`, encabezados `Authorization`, cookies, códigos OAuth ni
tokens completos. La sanitización automática y recursiva de campos queda como
una mejora futura.

Para probar el flujo real:

```text
ENABLE_COGNITO_DEBUG=false
```

Un error como el siguiente durante el backend build indica que la variable no
fue creada para la rama desplegada:

```text
Missing required backend environment variable: COGNITO_CLIENT_ID
```

## Simulador VTEX

El simulador reproduce desde el servidor el comportamiento esperado de VTEX:
recibe la redirección de login, solicita un authorization code, lo intercambia
por un access token y llama a `userinfo`. El correo solamente aparece después
de la respuesta de `userinfo`.

Configuración para un ambiente desplegado:

```text
ENABLE_COGNITO_DEBUG=false
ENABLE_VTEX_SIMULATOR=true
VTEX_STORE_LOGIN_URL=https://<dominio-bridge>/vtex-simulator/login
VTEX_ALLOWED_REDIRECT_URI=https://<dominio-bridge>/api/vtex-simulator/callback
VTEX_CLIENT_ID=toyota-cognito-vtex-test-client
VTEX_CLIENT_SECRET=dummy-vtex-secret-7Kp9xQ2mN8vR4tY6wL3s
VTEX_OAUTH_PROVIDER=ToyotaCognitoTest
VTEX_RETURN_URL=/
```

La prueba puede iniciarse desde `/start`. El botón abre directamente la URL de
Cognito con `prompt=none`, por lo que requiere una sesión Cognito vigente.

Al terminar, `/vtex-simulator/result` muestra:

- Validación del `state`.
- Recepción del authorization code.
- Estado HTTP y metadatos del token.
- Ejecución de `userinfo`.
- `userId`, correo y nombre recibidos por la tienda.
- `correlationId` para buscar el flujo en CloudWatch.

El `VTEX_CLIENT_SECRET` se usa exclusivamente en el callback del servidor. El
access token se mantiene en memoria durante la llamada a `userinfo`; no se
guarda en el registro del simulador ni se envía a la página de resultados.
Después de cambiar estas variables es necesario desplegar nuevamente.

## Generador de credenciales VTEX

La página `/vtex-credentials` genera en el servidor el nombre del proveedor,
el Client ID y un Client secret de 48 bytes para los ambientes `dev`, `qa`,
`stage` y `prod`. Para habilitarla temporalmente:

```text
ENABLE_VTEX_CREDENTIAL_GENERATOR=true
```

Los valores se generan con `crypto.randomBytes`, se muestran una sola vez y no
se guardan en DynamoDB, cookies, URLs, Local Storage o logs. Deben copiarse al
proveedor OAuth de VTEX y a las variables correspondientes de Amplify. Después
de utilizarlos, se debe volver a configurar la variable en `false` y desplegar
el ambiente nuevamente.

## Desarrollo local

Instalar dependencias:

```bash
npm install
```

Crear `.env.local` con las variables del ambiente y registrar el secreto de
Cognito para el sandbox:

```bash
npx ampx sandbox secret set COGNITO_CLIENT_SECRET
```

Comandos disponibles:

```bash
npm run sandbox
npm run dev
npm test
npm run typecheck
npm run build
npm run start
```

## Pendientes

- Configurar y probar el proveedor OAuth en una cuenta real de VTEX.
- Confirmar los dominios definitivos por ambiente.
- Implementar el flujo iniciado en VTEX sin sesión previa del bridge, si entra
  en el alcance.
- Diseñar la página `/vtex/error`.
- Revisar `RemovalPolicy.DESTROY` antes de producción.
- Asociar el SSR Compute role una vez en cada rama de Amplify.
- Agregar pruebas unitarias, de integración y end-to-end.
