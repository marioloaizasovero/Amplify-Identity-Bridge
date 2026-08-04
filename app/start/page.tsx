import { buildCognitoAuthorizationUrl } from "@/lib/cognito-authorization";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function CognitoStartPage() {
  const authorizationUrl = buildCognitoAuthorizationUrl({
    clientId: config.cognitoClientId,
    domain: config.cognitoDomain,
    prompt: "none",
    redirectUri: config.cognitoRedirectUri,
    scopes: config.cognitoScopes,
  });

  return (
    <main className="page-shell">
      <section className="status-panel">
        <span className="simulator-badge">Cognito</span>
        <h1>Iniciar flujo de autenticación</h1>
        <p>
          Esta acción verificará silenciosamente si existe una sesión activa
          en Cognito Toyota y continuará el flujo hacia el callback del bridge.
        </p>
        <p className="start-note">
          Si no existe una sesión vigente, Cognito responderá con
          <code>login_required</code> sin mostrar la pantalla de credenciales.
        </p>
        <div className="simulator-actions">
          <a className="primary-button" href={authorizationUrl.toString()}>
            Continuar con Cognito
          </a>
        </div>
      </section>
    </main>
  );
}
