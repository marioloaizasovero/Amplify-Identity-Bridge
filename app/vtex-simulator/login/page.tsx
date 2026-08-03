import { notFound } from "next/navigation";
import { config } from "@/lib/config";
import { logInfo } from "@/lib/logger";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function VtexSimulatorLoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!config.enableVtexSimulator) {
    notFound();
  }

  const provider =
    firstValue(searchParams.oAuthRedirect) ?? config.vtexOAuthProvider;
  const returnUrl = firstValue(searchParams.returnUrl) ?? config.vtexReturnUrl;

  logInfo("VTEX simulator login page received bridge parameters.", {
    event: "vtex.simulator.login.received",
    provider,
    returnUrl,
    stage: "simulator_login",
  });

  return (
    <main className="page-shell">
      <section className="status-panel">
        <span className="simulator-badge">VTEX Simulator</span>
        <h1>Tienda VTEX de prueba</h1>
        <p>
          El bridge terminó la autenticación Cognito y redirigió a esta tienda
          simulada. Continúa para ejecutar el protocolo OAuth que utilizaría
          VTEX.
        </p>

        <dl className="debug-list">
          <div>
            <dt>OAuth provider recibido</dt>
            <dd>{provider}</dd>
          </div>
          <div>
            <dt>Return URL recibido</dt>
            <dd>{returnUrl}</dd>
          </div>
          <div>
            <dt>Authorization endpoint</dt>
            <dd>/api/auth/vtex/authorize</dd>
          </div>
        </dl>

        <form
          action="/api/vtex-simulator/authorize"
          className="simulator-actions"
          method="get"
        >
          <input name="provider" type="hidden" value={provider} />
          <input name="returnUrl" type="hidden" value={returnUrl} />
          <button className="primary-button" type="submit">
            Continuar con el flujo VTEX
          </button>
        </form>
      </section>
    </main>
  );
}
