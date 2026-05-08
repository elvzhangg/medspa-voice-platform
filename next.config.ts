import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse v2 ships a `browser` export that Next's route-handler bundler
  // picks up incorrectly, breaking module load on the server (route 500s
  // before auth runs). Externalising forces native Node require → cjs build.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
