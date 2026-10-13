import { createApp } from "./app.js";
import { appConfig } from "./config/env.js";

const app = await createApp();

app.listen(appConfig.port, appConfig.host, () => {
  console.log(`CloudBridge360 running at ${appConfig.baseUrl}`);
});
