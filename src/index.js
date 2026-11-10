import { createApp } from "./app.js";
const app = createApp();
const server = app.listen(process.env.PORT || 4000, () =>
  console.log("Portfolio API ready on port " + (process.env.PORT || 4000)),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
