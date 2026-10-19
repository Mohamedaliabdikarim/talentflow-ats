/**
 * Liveness probe for Azure App Service and the Playwright web server check.
 * Deliberately does not touch the database: a database outage should surface as
 * application errors, not as a restart loop of the web process.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", timestamp: new Date().toISOString() });
}
