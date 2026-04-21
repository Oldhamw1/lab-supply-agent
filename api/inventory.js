// api/inventory.js — GET loads, POST saves inventory to Vercel KV
// Vercel KV auto-injects KV_REST_API_URL and KV_REST_API_TOKEN as env vars
// after you connect a KV database in the Vercel dashboard.

const SEED_INVENTORY = [
  { id: "BSA-001",  name: "BSA (Bovine Serum Albumin)", unit: "g",    qty: 500, min: 100, location: "Fridge A-2",  category: "Protein", sequence: "",           purity: "",       qcLink: "" },
  { id: "PBS-001",  name: "PBS 10x Buffer",              unit: "L",    qty: 12,  min: 4,   location: "Shelf B-1",  category: "Buffer",  sequence: "",           purity: "",       qcLink: "" },
  { id: "ETH-001",  name: "Ethanol 200 Proof",           unit: "L",    qty: 8,   min: 3,   location: "Flammables", category: "Solvent", sequence: "",           purity: "≥200pf", qcLink: "" },
  { id: "DMSO-001", name: "DMSO (Dimethyl Sulfoxide)",   unit: "mL",   qty: 250, min: 50,  location: "Shelf C-3",  category: "Solvent", sequence: "",           purity: "≥99.9%", qcLink: "" },
  { id: "TRIS-001", name: "Tris Base",                   unit: "g",    qty: 300, min: 80,  location: "Shelf B-2",  category: "Buffer",  sequence: "",           purity: "≥99%",   qcLink: "" },
  { id: "ATP-001",  name: "ATP Disodium Salt",           unit: "mg",   qty: 50,  min: 20,  location: "Freezer-1",  category: "Reagent", sequence: "",           purity: "≥99%",   qcLink: "" },
  { id: "PCR-001",  name: "Taq Polymerase 5U/µL",        unit: "rxns", qty: 200, min: 50,  location: "Freezer-2",  category: "Enzyme",  sequence: "",           purity: "",       qcLink: "" },
  { id: "AGR-001",  name: "Agarose LE",                  unit: "g",    qty: 400, min: 100, location: "Shelf D-1",  category: "Reagent", sequence: "",           purity: "",       qcLink: "" },
  { id: "OLG-AAA",  name: "Oligo AAA",                   unit: "µg",   qty: 250, min: 50,  location: "Freezer-2",  category: "Oligo",   sequence: "AAAAAAAAAA", purity: "HPLC",   qcLink: "" },
];

async function kvGet(key) {
  const url = `${process.env.KV_REST_API_URL}/get/${key}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
  });
  const data = await res.json();
  const result = data.result ?? null;
  if (result === null) return null;
  // Upstash may return a string or already-parsed value
  if (typeof result === "string") {
    try { return JSON.parse(result); } catch { return result; }
  }
  return result;
}

async function kvSet(key, value) {
  const url = `${process.env.KV_REST_API_URL}/set/${key}`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value }),
  });
}

module.exports = async function handler(req, res) {
  // Check KV is configured
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ error: "Vercel KV not configured. Add KV_REST_API_URL and KV_REST_API_TOKEN in environment variables." });
  }

  // GET — load inventory
  if (req.method === "GET") {
    try {
      const stored = await kvGet("lab-inventory");
      if (stored && Array.isArray(stored) && stored.length > 0) {
        return res.status(200).json({ inventory: stored });
      } else {
        // First time or empty — seed it
        await kvSet("lab-inventory", JSON.stringify(SEED_INVENTORY));
        return res.status(200).json({ inventory: SEED_INVENTORY });
      }
    } catch (err) {
      console.error("KV GET error:", err);
      return res.status(500).json({ error: "Failed to load inventory", detail: err.message });
    }
  }

  // POST — save inventory
  if (req.method === "POST") {
    try {
      const { inventory } = req.body;
      if (!Array.isArray(inventory)) {
        return res.status(400).json({ error: "inventory must be an array" });
      }
      await kvSet("lab-inventory", JSON.stringify(inventory));
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("KV SET error:", err);
      return res.status(500).json({ error: "Failed to save inventory", detail: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};
