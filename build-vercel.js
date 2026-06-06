import fs from 'fs';
import path from 'path';

console.log("Starting custom Vercel build output generation...");

const distClient = path.join(process.cwd(), 'dist', 'client');
const distServer = path.join(process.cwd(), 'dist', 'server');
const vercelOutput = path.join(process.cwd(), '.vercel', 'output');

// Create .vercel/output structure
fs.mkdirSync(path.join(vercelOutput, 'static'), { recursive: true });
fs.mkdirSync(path.join(vercelOutput, 'functions', 'index.func'), { recursive: true });

// Move static assets
if (fs.existsSync(distClient)) {
  fs.cpSync(distClient, path.join(vercelOutput, 'static'), { recursive: true });
  console.log("Copied static assets to .vercel/output/static");
} else {
  console.error("No dist/client found!");
}

// Move server assets
if (fs.existsSync(distServer)) {
  fs.cpSync(distServer, path.join(vercelOutput, 'functions', 'index.func'), { recursive: true });
  console.log("Copied server assets to .vercel/output/functions/index.func");
} else {
  console.error("No dist/server found!");
}

// Create routing config
const configJson = {
  version: 3,
  routes: [
    { handle: "filesystem" },
    { src: "/(.*)", dest: "/" }
  ]
};
fs.writeFileSync(path.join(vercelOutput, 'config.json'), JSON.stringify(configJson, null, 2));
console.log("Created .vercel/output/config.json");

// Find entrypoint
const files = fs.readdirSync(path.join(vercelOutput, 'functions', 'index.func'));
const entrypoint = files.find(f => f === 'index.mjs' || f === 'server.mjs') || 'index.mjs';

// Create function config
const vcConfigJson = {
  runtime: "nodejs22.x",
  handler: entrypoint,
  launcherType: "Nodejs"
};
fs.writeFileSync(path.join(vercelOutput, 'functions', 'index.func', '.vc-config.json'), JSON.stringify(vcConfigJson, null, 2));
console.log(`Created .vc-config.json with handler ${entrypoint} (Node.js runtime)`);

console.log("Vercel build output generation complete!");
