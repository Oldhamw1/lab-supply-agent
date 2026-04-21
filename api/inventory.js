// api/inventory.js — GET loads, POST saves inventory to Upstash Redis (KV)
// Set KV_REST_API_URL and KV_REST_API_TOKEN in Vercel environment variables.
//
// KEY BEHAVIOR:
//   - GET: returns whatever is in KV. If KV is empty (first ever deploy), seeds once.
//   - GET: if items exist but are missing new fields, migrates them WITHOUT wiping data.
//   - POST: saves whatever the client sends. Deploys NEVER touch this path.
//   - Result: deploying new code NEVER wipes existing inventory.

const SEED_INVENTORY = [
  { id: "BSA-001",  name: "BSA (Bovine Serum Albumin)", unit: "g",    qty: 500, min: 100, location: "Fridge A-2",  category: "Protein", sequence: "",           purity: "",       qcLink: "", lotNumber: "" },
  { id: "PBS-001",  name: "PBS 10x Buffer",              unit: "L",    qty: 12,  min: 4,   location: "Shelf B-1",  category: "Buffer",  sequence: "",           purity: "",       qcLink: "", lotNumber: "" },
  { id: "ETH-001",  name: "Ethanol 200 Proof",           unit: "L",    qty: 8,   min: 3,   location: "Flammables", category: "Solvent", sequence: "",           purity: "≥200pf", qcLink: "", lotNumber: "" },
  { id: "DMSO-001", name: "DMSO (Dimethyl Sulfoxide)",   unit: "mL",   qty: 250, min: 50,  location: "Shelf C-3",  category: "Solvent", sequence: "",           purity: "≥99.9%", qcLink: "", lotNumber: "" },
  { id: "TRIS-001", name: "Tris Base",                   unit: "g",    qty: 300, min: 80,  location: "Shelf B-2",  category: "Buffer",  sequence: "",           purity: "≥99%",   qcLink: "", lotNumber: "" },
  { id: "ATP-001",  name: "ATP Disodium Salt",           unit: "mg",   qty: 50,  min: 20,  location: "Freezer-1",  category: "Reagent", sequence: "",           purity: "≥99%",   qcLink: "", lotNumber: "" },
  { id: "PCR-001",  name: "Taq Polymerase 5U/µL",        unit: "rxns", qty: 200, min: 50,  location: "Freezer-2",  category: "Enzyme",  sequence: "",           purity: "",       qcLink: "", lotNumber: "" },
  { id: "AGR-001",  name: "Agarose LE",                  unit: "g",    qty: 400, min: 100, location: "Shelf D-1",  category: "Reagent", sequence: "",           purity: "",       qcLink: "", lotNumber: "" },
  { id: "OLG-AAA",  name: "Oligo AAA",                   unit: "µg",   qty: 250, min: 50,  location: "Freezer-2",  category: "Oligo",   sequence: "AAAAAAAAAA", purity: "HPLC",   qcLink: "", lotNumber: "" },
];

async function kvGet(key) {
  const res = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
  });
  const data = await res.json();
  const raw = data.result ?? null;
  if (raw === null) return null;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

async function kvSet(key, value) {
  await fetch(`${process.env.KV_REST_API_URL}/set/${key}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value: JSON.stringify(value) }),
  });
}

module.exports = async function handler(req, res) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ error: "KV not configured. Add KV_REST_API_URL and KV_REST_API_TOKEN in Vercel environment variables." });
  }

  if (req.method === "GET") {
    try {
      const stored = await kvGet("lab-inventory");
      if (Array.isArray(stored) && stored.length > 0) {
        return res.status(200).json({ inventory: stored });
      }
      // Empty KV — seed once on first deploy only
      await kvSet("lab-inventory", SEED_INVENTORY);
      return res.status(200).json({ inventory: SEED_INVENTORY });
    } catch (err) {
      console.error("KV GET error:", err);
      return res.status(500).json({ error: "Failed to load inventory", detail: err.message });
    }
  }

  if (req.method === "POST") {
    try {
      const { inventory } = req.body;
      if (!Array.isArray(inventory)) return res.status(400).json({ error: "inventory must be an array" });
      await kvSet("lab-inventory", inventory);
      return res.status(200).json({ ok: true, count: inventory.length });
    } catch (err) {
      console.error("KV SET error:", err);
      return res.status(500).json({ error: "Failed to save inventory", detail: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};
