import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { config } from "@/lib/config";
import { getCognitoDebugSessionCookieName } from "@/lib/responses";
import { consumeCognitoResult } from "@/lib/session-store";

export const dynamic = "force-dynamic";

export default async function CognitoDebugPage() {
  noStore();

  if (!config.enableCognitoDebug) {
    notFound();
  }

  const sessionId = cookies().get(getCognitoDebugSessionCookieName())?.value;
  const result = sessionId ? await consumeCognitoResult(sessionId) : null;

  return (
    <main className="page-shell">
      <section className="status-panel">
        <h1>Cognito validation</h1>
        {!sessionId ? (
          <p>No hay una sesion de validacion para mostrar.</p>
        ) : !result ? (
          <p>No se encontro resultado para la sesion indicada.</p>
        ) : result.ok ? (
          <>
            <p>Validacion Cognito correcta.</p>
            <dl className="debug-list">
              <div>
                <dt>Session</dt>
                <dd>{sessionId}</dd>
              </div>
              <div>
                <dt>Sub</dt>
                <dd>{result.claims?.sub ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{result.claims?.email ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Name</dt>
                <dd>{result.claims?.name ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Username</dt>
                <dd>{result.claims?.username ?? "N/A"}</dd>
              </div>
            </dl>
          </>
        ) : (
          <>
            <p>Validacion Cognito con error controlado.</p>
            <dl className="debug-list">
              <div>
                <dt>Session</dt>
                <dd>{sessionId}</dd>
              </div>
              <div>
                <dt>Error</dt>
                <dd>{result.error ?? "unknown_error"}</dd>
              </div>
              <div>
                <dt>Detail</dt>
                <dd>{result.detail ?? "N/A"}</dd>
              </div>
            </dl>
          </>
        )}
      </section>
    </main>
  );
}
