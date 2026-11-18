// Sums the downloads of every ABP Admin package and writes shields.io endpoint badges (total, NuGet, npm).
// Package ids come from the repo: <PackageId> in packages/backend/src/*/*.csproj and the names in
// packages/frontend/projects/*/package.json (except the demo app). Usage: node download-badges.mjs <out-dir>
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'badges';
const src = 'packages/backend/src', projects = 'packages/frontend/projects';

const nugetIds = readdirSync(src).flatMap(d => {
  const csproj = join(src, d, `${d}.csproj`);
  const id = existsSync(csproj) && readFileSync(csproj, 'utf8').match(/<PackageId>([^<]+)<\/PackageId>/)?.[1];
  return id ? [id] : [];
});
const npmIds = readdirSync(projects).flatMap(d => {
  const pkg = join(projects, d, 'package.json');
  if (!existsSync(pkg)) return [];
  const j = JSON.parse(readFileSync(pkg, 'utf8'));
  return j.private || !j.name?.startsWith('@nazem0/') ? [] : [j.name];
});

const get = async url => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

// NuGet: all-time totals from the search service.
const nuget = await Promise.all(nugetIds.map(async id => {
  const j = await get(`https://azuresearch-usnc.nuget.org/query?q=packageid:${id}&prerelease=true&semVerLevel=2.0.0`);
  return j.data.find(p => p.id.toLowerCase() === id.toLowerCase())?.totalDownloads ?? 0;
}));

// npm: its API serves at most 18 months per query and no bulk lookup for scoped packages.
// ponytail: 18-month window, so the npm figure stops being "all time" after May 2028; sum windows then.
const day = d => d.toISOString().slice(0, 10);
const from = new Date(Math.max(Date.parse('2026-11-01'), Date.now() - 540 * 864e5));
const npm = await Promise.all(npmIds.map(async id => {
  const r = await fetch(`https://api.npmjs.org/downloads/point/${day(from)}:${day(new Date())}/${id}`);
  return r.ok ? (await r.json()).downloads ?? 0 : 0; // 404 until npm has stats for a new package
}));

const sum = a => a.reduce((x, y) => x + y, 0);
const fmt = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n}`;
const totals = { total: sum(nuget) + sum(npm), nuget: sum(nuget), npm: sum(npm) };

mkdirSync(out, { recursive: true });
const badge = (file, label, n, color) =>
  writeFileSync(join(out, file), JSON.stringify({ schemaVersion: 1, label, message: fmt(n), color }) + '\n');
badge('downloads.json', 'total downloads', totals.total, 'blue');
badge('nuget.json', 'NuGet downloads', totals.nuget, '004880');
badge('npm.json', 'npm downloads', totals.npm, 'cb3837');
console.log(JSON.stringify({ ...totals, nugetPackages: nugetIds.length, npmPackages: npmIds.length }));
