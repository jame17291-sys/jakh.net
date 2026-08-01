import siteManifest from "../generated/site-manifest.js";
import mtaStsPolicy from "../assets/mta-sts.txt";

import { createSiteHandler } from "./site-edge.js";

const siteHandler = createSiteHandler({ siteManifest, mtaStsPolicy });

export default {
  async fetch(request, env, context) {
    const response = await siteHandler.fetch(request, env, context);
    const headers = new Headers(response.headers);
    if (typeof env.CF_VERSION_METADATA?.id === "string") {
      headers.set("x-jakh-worker-version", env.CF_VERSION_METADATA.id);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
