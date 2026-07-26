# Amplify Identity Bridge

Bridge OAuth entre Amazon Cognito y una tienda VTEX.

## Flujo implementado

1. Cognito redirige a `/api/auth/cognito/callback?code=...`.
2. El backend intercambia el codigo y valida firma, emisor, audiencia,
   expiracion, tipo de token y correo verificado.
3. El bridge crea una sesion temporal `HttpOnly`.
4. El bridge redirige al login de la tienda con el proveedor OAuth configurado.
5. VTEX solicita `/api/auth/vtex/authorize`.
6. El bridge emite un codigo de un solo uso.
7. VTEX intercambia el codigo en `/api/auth/vtex/token`.
8. VTEX obtiene la identidad desde `/api/auth/vtex/userinfo` y crea su sesion.

El callback tambien conserva compatibilidad con `state` y `nonce` cuando el
flujo de Cognito los proporciona.

## Escenarios de autenticacion

| Escenario | Flujo | Estado |
| --- | --- | --- |
| Login iniciado en Cognito | Cognito valida al usuario, retorna al callback del bridge y el bridge continua automaticamente hacia VTEX. | Implementado |
| Login iniciado en VTEX con sesion bridge | VTEX llama a `/api/auth/vtex/authorize`, el bridge consume la sesion existente y completa `authorize`, `token` y `userinfo`. | Implementado |
| Login iniciado en VTEX sin sesion bridge | El bridge debe guardar la solicitud VTEX pendiente, redirigir a Cognito y retomar el flujo VTEX despues del callback. | Pendiente |

El tercer escenario queda fuera del alcance actual. Mientras no se implemente,
`/api/auth/vtex/authorize` responde `login_required` cuando no encuentra una
sesion temporal valida del bridge. La implementacion futura debera correlacionar
la solicitud VTEX pendiente mediante un identificador aleatorio en una cookie
`HttpOnly` y un registro temporal en DynamoDB, sin requerir una ruta `/start`
publica.

## Endpoints

- `GET /api/auth/cognito/callback`: callback registrado en Cognito.
- `GET /api/auth/vtex/authorize`: autorizacion OAuth para VTEX.
- `POST /api/auth/vtex/token`: intercambio de codigo por access token.
- `GET /api/auth/vtex/userinfo`: identidad asociada al access token.
- `GET /api/auth/vtex/logout`: elimina la sesion temporal del bridge.
- `GET /cognito-debug`: resultado de diagnostico cuando esta habilitado.

## Variables requeridas

```text
AWS_REGION
BRIDGE_BASE_URL
COGNITO_CLIENT_ID
COGNITO_CLIENT_SECRET
COGNITO_DOMAIN
COGNITO_REDIRECT_URI
COGNITO_SCOPES
COGNITO_STATE_TTL_SECONDS
BRIDGE_SESSION_TTL_SECONDS
COGNITO_USER_POOL_ID
ENABLE_COGNITO_DEBUG
VTEX_CLIENT_ID
VTEX_CLIENT_SECRET
VTEX_ALLOWED_REDIRECT_URI
VTEX_STORE_LOGIN_URL
VTEX_OAUTH_PROVIDER
VTEX_RETURN_URL
```

Para el dominio acordado, el callback Cognito debe registrarse exactamente
como:

```text
https://dummy-dev.bridge-vtex.toyota.cl/api/auth/cognito/callback
```

`VTEX_CLIENT_SECRET` debe almacenarse como secreto y nunca enviarse al
navegador ni registrarse en logs.

Ejemplo de configuracion del retorno automatico a la tienda:

```text
VTEX_STORE_LOGIN_URL=https://www.tienda.example/login
VTEX_OAUTH_PROVIDER=ToyotaSSO
VTEX_RETURN_URL=/
```

`VTEX_STORE_LOGIN_URL` y `VTEX_OAUTH_PROVIDER` deben coincidir con el dominio
publico y el nombre exacto del proveedor configurado en VTEX. `VTEX_RETURN_URL`
solo acepta una ruta relativa del mismo sitio para impedir open redirects.

Con `ENABLE_COGNITO_DEBUG=true`, el flujo termina en `/cognito-debug`. Para que
continue automaticamente hacia VTEX debe configurarse:

```text
ENABLE_COGNITO_DEBUG=false
```

## Desarrollo

```bash
npm install
npm run typecheck
npm run build
npm run dev
```
