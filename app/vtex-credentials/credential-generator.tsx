"use client";

import { useActionState, useState } from "react";
import {
  generateVtexCredentialsAction,
  type CredentialGeneratorState,
} from "./actions";

const initialState: CredentialGeneratorState = {};

function CopyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <div className="credential-field">
      <dt>{label}</dt>
      <dd>
        <code>{value}</code>
        <button className="copy-button" onClick={copyValue} type="button">
          {copied ? "Copiado" : "Copiar"}
        </button>
      </dd>
    </div>
  );
}

export function CredentialGenerator() {
  const [state, formAction, pending] = useActionState(
    generateVtexCredentialsAction,
    initialState,
  );
  const credentials = state.credentials;

  return (
    <>
      <form action={formAction} autoComplete="off" className="credential-form">
        <label htmlFor="environment">Ambiente</label>
        <select defaultValue="dev" id="environment" name="environment">
          <option value="dev">Development</option>
          <option value="qa">QA</option>
          <option value="stage">Stage</option>
          <option value="prod">Producción</option>
        </select>
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? "Generando…" : "Generar credenciales"}
        </button>
      </form>

      {state.error ? <p className="status-error">{state.error}</p> : null}

      {credentials ? (
        <section aria-live="polite" className="credential-result">
          <h2>Credenciales generadas</h2>
          <p className="start-note">
            Copia y almacena el secreto ahora. La aplicación no guarda estos
            valores y no podrá recuperarlos después de salir de esta página.
          </p>

          <dl className="debug-list">
            <CopyField
              label="Nombre del proveedor"
              value={credentials.providerName}
            />
            <CopyField label="Client ID" value={credentials.clientId} />
            <CopyField
              label="Client secret"
              value={credentials.clientSecret}
            />
          </dl>

          <h3>Variables para Amplify</h3>
          <pre className="credential-config">
            {`VTEX_OAUTH_PROVIDER=${credentials.providerName}\nVTEX_CLIENT_ID=${credentials.clientId}\nVTEX_CLIENT_SECRET=${credentials.clientSecret}`}
          </pre>

          <h3>Campos para VTEX</h3>
          <pre className="credential-config">
            {`Identity provider name: ${credentials.providerName}\nClient ID key: client_id\nClient ID value: ${credentials.clientId}\nClient secret key: client_secret\nClient secret value: ${credentials.clientSecret}`}
          </pre>
        </section>
      ) : null}
    </>
  );
}
