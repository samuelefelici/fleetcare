import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema",
  out: "./migrations",
  // tutto FleetCare vive nello schema "fleetcare": drizzle-kit non guarda altrove
  schemaFilter: ["fleetcare"],
  dbCredentials: {
    // le migration girano con il ruolo owner, mai con quello dell'app
    url: process.env.DATABASE_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/fleetcare",
  },
  verbose: true,
  strict: true,
});
