import type { Metadata } from "next";
import "../admin.css";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="admin login">
      <form method="post" action="/api/admin/login">
        <label>
          Password
          <input
            type="password"
            name="password"
            autoFocus
            required
            autoComplete="current-password"
          />
        </label>
        <button type="submit">Entra</button>
        {error && <p className="error">Password errata.</p>}
      </form>
    </main>
  );
}
