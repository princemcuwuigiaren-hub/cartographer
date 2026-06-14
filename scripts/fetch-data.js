// scripts/fetch-data.js
// Reads data/matches.json, then fetches team form, H2H, and standings
// for every fixture from today (the most recent date), with throttling
// to respect football-data.org's free-tier rate limit (10 req/min).

const fs = require('fs');
const path = require('path');

const API_TOKEN = process.env.API_TOKEN;
const BASE = 'https://api.football-data.org/v4';
const DATA_DIR = path.join(__dirname, '..', 'data');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function apiGet(ep) {
  const url = BASE + ep;
  const r = await fetch(url, { headers: { 'X-Auth-Token': API_TOKEN } });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    console.warn(`WARN ${r.status} for ${ep}: ${body.slice(0,200)}`);
    return null;
  }
  return r.json();
}

async function main() {
  const matchesPath = path.join(DATA_DIR, 'matches.json');
  const raw = JSON.parse(fs.readFileSync(matchesPath, 'utf8'));
  const allMatches = raw.matches || [];

  // Focus on TODAY's fixtures (UTC date)
  const today = new Date().toISOString().slice(0,10);
  const todays = allMatches.filter(m => (m.utcDate||'').slice(0,10) === today);

  console.log(`Found ${todays.length} fixtures for ${today}`);

  // Collect unique team IDs, fixture IDs, and competition codes
  const teamIds = new Set();
  const fixtureIds = [];
  const compCodes = new Set();

  todays.forEach(m => {
    if (m.homeTeam?.id) teamIds.add(m.homeTeam.id);
    if (m.awayTeam?.id) teamIds.add(m.awayTeam.id);
    if (m.id) fixtureIds.push(m.id);
    if (m.competition?.code) compCodes.add(m.competition.code);
  });

  console.log(`Unique teams: ${teamIds.size}, fixtures: ${fixtureIds.length}, competitions: ${compCodes.size}`);

  const DELAY = 6500; // ~9 req/min, safely under 10/min limit

  // ── Team form (recent finished matches) ──
  const teams = {};
  for (const id of teamIds) {
    const d = await apiGet(`/teams/${id}/matches?status=FINISHED&limit=20`);
    teams[id] = d?.matches || [];
    console.log(`  team ${id}: ${teams[id].length} matches`);
    await sleep(DELAY);
  }

  // ── Head-to-head per fixture ──
  const h2h = {};
  for (const id of fixtureIds) {
    const d = await apiGet(`/matches/${id}/head2head?limit=10`);
    h2h[id] = d || { matches: [] };
    console.log(`  h2h ${id}: ${(d?.matches||[]).length} matches`);
    await sleep(DELAY);
  }

  // ── Standings per competition ──
  const standings = {};
  for (const code of compCodes) {
    const d = await apiGet(`/competitions/${code}/standings`);
    standings[code] = d || { standings: [] };
    console.log(`  standings ${code}: ${d ? 'ok' : 'failed'}`);
    await sleep(DELAY);
  }

  fs.writeFileSync(path.join(DATA_DIR, 'teams.json'), JSON.stringify(teams));
  fs.writeFileSync(path.join(DATA_DIR, 'h2h.json'), JSON.stringify(h2h));
  fs.writeFileSync(path.join(DATA_DIR, 'standings.json'), JSON.stringify(standings));

  console.log('Done.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
      
