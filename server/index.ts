import { createApp } from "./app.js";
import { Store } from "./store.js";

/** Local API listening port, optionally overridden through the environment. */
const port = Number(process.env.PORT || 3001);

createApp(new Store()).listen(
  port,
  "127.0.0.1",

  /** Reports the local URL after the HTTP server has started. */ () =>
    console.log(`Open Hours API: http://127.0.0.1:${port}`),
);
