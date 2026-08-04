import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { config } from "@/lib/config";
import { logDebug } from "@/lib/logger";
import { getCognitoDebugSessionCookieName } from "@/lib/responses";
import { consumeCognitoResult } from "@/lib/session-store";

export const dynamic = "force-dynamic";

export default async function CognitoDebugPage() {
  noStore();

  if (!config.enableCognitoDebug) {
    notFound();
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(getCognitoDebugSessionCookieName())?.value;
  const result = sessionId ? await consumeCognitoResult(sessionId) : null;

  logDebug("Cognito debug page requested.", {
    correlationId: result?.correlationId,
    event: "cognito.debug.viewed",
    hasResult: Boolean(result),
    hasSession: Boolean(sessionId),
    stage: "cognito_debug",
  });

  return (
    <main className="page-shell">
      <section className="status-panel">
        <h1>Cognito validation</h1>
        {!sessionId ? (
          <p>No hay una sesion de validacion para mostrar.</p>
        ) : !result ? (
          <p>No se encontro resultado para la sesion indicada.</p>
        ) : (
          <>
            <p>
              {result.ok
                ? "Validacion Cognito correcta."
                : "Validacion Cognito con error controlado."}
            </p>
            <dl className="debug-list">
              <div>
                <dt>Session</dt>
                <dd>{sessionId}</dd>
              </div>
              <div>
                <dt>Correlation ID</dt>
                <dd>{result.correlationId ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>{result.ok ? "OK" : "ERROR"}</dd>
              </div>
              <div>
                <dt>Ultima etapa</dt>
                <dd>{result.stage ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Fecha del resultado</dt>
                <dd>{result.createdAt ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Lambda Request ID</dt>
                <dd>{result.diagnostics?.lambdaRequestId ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Token type</dt>
                <dd>{result.diagnostics?.tokenType ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Token expires in</dt>
                <dd>{result.diagnostics?.tokenExpiresIn ?? "N/A"}</dd>
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
                <dt>Email verified</dt>
                <dd>
                  {result.claims?.emailVerified === undefined
                    ? "N/A"
                    : String(result.claims.emailVerified)}
                </dd>
              </div>
              <div>
                <dt>Name</dt>
                <dd>{result.claims?.name ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Username</dt>
                <dd>{result.claims?.username ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Error</dt>
                <dd>{result.error ?? "N/A"}</dd>
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
