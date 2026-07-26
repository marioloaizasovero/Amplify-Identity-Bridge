export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="status-panel">
        <h1>Hola mundo</h1>
        <p>Scaffold inicial del Toyota VTEX Identity Bridge sobre Amplify Gen 2.</p>
        <ul className="endpoint-list">
          <li>/api/auth/cognito/start</li>
          <li>/cognito-debug</li>
          <li>/vtex</li>
          <li>/api/auth/vtex/authorize</li>
          <li>/api/auth/vtex/token</li>
          <li>/api/auth/vtex/userinfo</li>
        </ul>
      </section>
    </main>
  );
}
