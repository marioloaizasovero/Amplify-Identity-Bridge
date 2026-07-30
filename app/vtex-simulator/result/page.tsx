import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { config } from "@/lib/config";
import { vtexSimulatorSessionCookieName } from "@/lib/cookies";
import { logDebug } from "@/lib/logger";
import { getVtexSimulatorResult } from "@/lib/session-store";

export const dynamic = "force-dynamic";

export default async function VtexSimulatorResultPage() {
  noStore();

  if (!config.enableVtexSimulator) {
    notFound();
  }

  const sessionId = cookies().get(vtexSimulatorSessionCookieName)?.value;
  const result = sessionId
    ? await getVtexSimulatorResult(sessionId)
    : null;

  logDebug("VTEX simulator result page requested.", {
    correlationId: result?.correlationId,
    event: "vtex.simulator.result.viewed",
    hasResult: Boolean(result),
    hasSession: Boolean(sessionId),
    stage: "simulator_result",
  });

  return (
    <main className="page-shell">
      <section className="status-panel">
        <span className="simulator-badge">VTEX Simulator</span>
        <h1>Resultado del flujo VTEX</h1>

        {!sessionId ? (
          <p>No existe una sesión del simulador en este navegador.</p>
        ) : !result ? (
          <p>El resultado no existe o ya expiró.</p>
        ) : (
          <>
            <p className={result.ok ? "status-success" : "status-error"}>
              {result.ok
                ? "El flujo terminó correctamente y la tienda recibió el correo."
                : "El flujo terminó con un error controlado."}
            </p>

            <ol className="simulator-timeline">
              {result.stages.map((stage, index) => (
                <li className={`stage-${stage.status}`} key={`${stage.name}-${index}`}>
                  <strong>{stage.name}</strong>
                  <span>
                    {stage.status === "success" ? "Correcto" : "Error"}
                    {stage.durationMs === undefined
                      ? ""
                      : ` · ${stage.durationMs} ms`}
                  </span>
                  {stage.detail ? <small>{stage.detail}</small> : null}
                </li>
              ))}
            </ol>

            <dl className="debug-list">
              <div>
                <dt>Correlation ID</dt>
                <dd>{result.correlationId ?? "N/A"}</dd>
              </div>
              <div>
                <dt>OAuth provider</dt>
                <dd>{result.provider ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Return URL</dt>
                <dd>{result.returnUrl ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Token HTTP status</dt>
                <dd>{result.token?.httpStatus ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Token type</dt>
                <dd>{result.token?.tokenType ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Token expires in</dt>
                <dd>{result.token?.expiresIn ?? "N/A"}</dd>
              </div>
              <div>
                <dt>User ID</dt>
                <dd>{result.userInfo?.userId ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Correo recibido por la tienda</dt>
                <dd>{result.userInfo?.email ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Nombre</dt>
                <dd>{result.userInfo?.name ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Error</dt>
                <dd>{result.error ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Detalle</dt>
                <dd>{result.detail ?? "N/A"}</dd>
              </div>
            </dl>
          </>
        )}

        <div className="simulator-actions">
          <a className="primary-button" href="/api/auth/cognito/start">
            Iniciar una nueva prueba
          </a>
        </div>
      </section>
    </main>
  );
}
