const errorMessages: Record<string, string> = {
  access_denied: "La autenticación fue cancelada o denegada.",
  login_required:
    "No existe una sesión activa en Cognito Toyota. Inicia sesión en Cognito antes de volver a intentar.",
  missing_code: "Cognito no retornó el código de autorización esperado.",
  token_endpoint_timeout:
    "Cognito no respondió dentro del tiempo esperado. Intenta nuevamente.",
};

type VtexErrorPageProps = {
  searchParams?: Promise<{
    error?: string | string[];
  }>;
};

export const dynamic = "force-dynamic";

export default async function VtexErrorPage({
  searchParams,
}: VtexErrorPageProps) {
  const resolvedSearchParams = await searchParams;
  const error = Array.isArray(resolvedSearchParams?.error)
    ? resolvedSearchParams.error[0]
    : resolvedSearchParams?.error;
  const message = error
    ? errorMessages[error] ?? "No fue posible completar la autenticación."
    : "No fue posible completar la autenticación.";

  return (
    <main className="page-shell">
      <section className="status-panel">
        <h1>No se pudo completar el ingreso</h1>
        <p>{message}</p>
        <div className="simulator-actions">
          <a className="primary-button" href="/start">
            Intentar nuevamente
          </a>
        </div>
      </section>
    </main>
  );
}
