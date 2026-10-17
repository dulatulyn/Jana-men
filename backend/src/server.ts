import { createApp } from "./app";

const port = Number(process.env.PORT || 8000);
createApp().listen(port, () => {
  console.log(`JanaMen API → http://localhost:${port}/api/v1  (health: /api/v1/health)`);
});
