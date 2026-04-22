#!/usr/bin/env node
const os = require("os");
const fs = require("fs");
const path = require("path");

function detectLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    // Skip Docker and virtual adapters
    if (/docker|vmware|vethernet|loopback|vbox/i.test(name)) continue;
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

function updateEnvVar(filePath, key, newValue) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  skipped — file not found: ${filePath}`);
    return;
  }
  const content = fs.readFileSync(filePath, "utf8");
  // Match key = value or key=value, replacing only the value portion
  const pattern = new RegExp(`^(${key}\\s*=\\s*).*`, "m");
  if (!pattern.test(content)) {
    console.warn(`  skipped — key "${key}" not found in ${filePath}`);
    return;
  }
  const updated = content.replace(pattern, `$1${newValue}`);
  fs.writeFileSync(filePath, updated, "utf8");
}

const ip = detectLanIp();
if (!ip) {
  console.error("Could not detect a LAN IP address. Are you connected to a network?");
  process.exit(1);
}

console.log(`Detected LAN IP: ${ip}\n`);

const root = __dirname;

console.log("Updating frontend/.env ...");
updateEnvVar(
  path.join(root, "frontend", ".env"),
  "EXPO_PUBLIC_API_BASE_URL",
  `http://${ip}:3000/api/map`
);
console.log(`  EXPO_PUBLIC_API_BASE_URL=http://${ip}:3000/api/map`);

console.log("Updating backend/.env ...");
updateEnvVar(
  path.join(root, "backend", ".env"),
  "CORS_ORIGIN",
  `http://${ip}:8081`
);
console.log(`  CORS_ORIGIN=http://${ip}:8081`);

console.log("\nDone. Restart the backend and Expo bundler to pick up the new IP.");
