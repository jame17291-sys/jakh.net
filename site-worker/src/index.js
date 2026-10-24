import siteManifest from "../generated/site-manifest.js";
import mtaStsPolicy from "../assets/mta-sts.txt";

import { createSiteHandler, withWorkerVersion } from "./site-edge.js";

const siteHandler = createSiteHandler({ siteManifest, mtaStsPolicy });

export default {
  async fetch(request, env, context) {
    const response = await siteHandler.fetch(request, env, context);
    // Adds the header to the same Response object, so a precompressed HTML
    // body keeps its `encodeBody: "manual"` setting (see site-edge.js).
    return withWorkerVersion(response, env.CF_VERSION_METADATA?.id);
  },
};
