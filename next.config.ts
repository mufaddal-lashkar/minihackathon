import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rule tables and pre-generated translations are read from disk at runtime; make sure they ship
  // inside the serverless function bundle on Vercel.
  outputFileTracingIncludes: { "/**": ["./data/rules/**", "./data/seed-i18n.json"] },
};

export default nextConfig;
