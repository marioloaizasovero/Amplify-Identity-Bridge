import { notFound } from "next/navigation";
import { config } from "@/lib/config";
import { CredentialGenerator } from "./credential-generator";

export const dynamic = "force-dynamic";

export default function VtexCredentialsPage() {
  if (!config.enableVtexCredentialGenerator) {
    notFound();
  }

  return (
    <main className="page-shell">
      <section className="status-panel credential-panel">
        <span className="simulator-badge">VTEX OAuth</span>
        <h1>Generar credenciales para VTEX</h1>
        <p>
          Genera el nombre del proveedor, el Client ID y el Client secret que
          deben registrarse tanto en VTEX como en Amplify.
        </p>
        <CredentialGenerator />
      </section>
    </main>
  );
}
