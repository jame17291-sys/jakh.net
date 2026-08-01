import siteManifest from "../generated/site-manifest.js";
import mtaStsPolicy from "../assets/mta-sts.txt";

import { createSiteHandler } from "./site-edge.js";

export default createSiteHandler({ siteManifest, mtaStsPolicy });
