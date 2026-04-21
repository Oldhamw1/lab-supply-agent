import { useState, useEffect, useRef } from "react";

// ── Default seed inventory ──────────────────────────────────────────────────
const SEED_INVENTORY = [
  { id: "BSA-001",  name: "BSA (Bovine Serum Albumin)", unit: "g",    qty: 500, min: 100, location: "Fridge A-2",  category: "Protein" },
  { id: "PBS-001",  name: "PBS 10x Buffer",              unit: "L",    qty: 12,  min: 4,   location: "Shelf B-1",  category: "Buffer"   },
  { id: "ETH-001",  name: "Ethanol 200 Proof",           unit: "L",    qty: 8,   min: 3,   location: "Flammables", category: "Solvent"  },
  { id: "DMSO-001", name: "DMSO (Dimethyl Sulfoxide)",   unit: "mL",   qty: 250, min: 50,  location: "Shelf C-3",  category: "Solvent"  },
  { id: "TRIS-001", name: "Tris Base",                   unit: "g",    qty: 300, min: 80,  location: "Shelf B-2",  category: "Buffer"   },
  { id: "ATP-001",  name: "ATP Disodium Salt",           unit: "mg",   qty: 50,  min: 20,  location: "Freezer-1",  category: "Reagent"  },
  { id: "PCR-001",  name: "Taq Polymerase 5U/µL",        unit: "rxns", qty: 200, min: 50,  location: "Freezer-2",  category: "Enzyme"   },
  { id: "AGR-001",  name: "Agarose LE",                  unit: "g",    qty: 400, min: 100, location: "Shelf D-1",  category: "Reagent"  },
  { id: "OLG-AAA",  name: "Oligo AAA",                   unit: "µg",   qty: 250, min: 50,  location: "Freezer-2",  category: "Oligo"    },
];

const SYSTEM_PROMPT = `You are LabAgent, an intelligent R&D lab supply assistant. You manage inventory and process supply orders.

You have access to the current inventory (provided in each message).

You can handle these actions:
1. ORDER - R&D researcher requests a reagent/supply. Extract: item name, quantity, requester name, urgency (routine/urgent/ASAP).
2. RECEIVE - New stock arrives. Extract: item name, quantity received.
3. CHECK - Query inventory status for a specific item or category.
4. ADJUST - Manual inventory correction. Extract: item name, new quantity.
5. REPORT - Generate a summary report (low stock, all items, by category).

CRITICAL: Always respond with a JSON object ONLY — no markdown, no explanation outside JSON.

Response schema:
{
  "action": "ORDER" | "RECEIVE" | "CHECK" | "ADJUST" | "REPORT" | "CHITCHAT",
  "reply": "friendly human-readable response to the user",
  "updates": [{ "id": "item-id", "delta": number, "note": "string" }],
  "flags": ["low-stock: item name", ...],
  "highlight": "item-id or null"
}

Rules:
- Be concise, professional, and helpful. You work in a biotech lab.
- If an order would deplete stock below minimum, warn the user.
- If item not found, suggest closest match.
- For REPORT action, summarize in the reply field.
- Partial matches are fine (e.g. "BSA" matches "BSA (Bovine Serum Albumin)").`;

// ── Storage helpers (localStorage) ──────────────────────────────────────────
const storage = {
  get: (key) => {
    try {
      const val = localStorage.getItem(key);
      return val ? { value: val } : null;
    } catch { return null; }
  },
  set: (key, value) => {
    try { localStorage.setItem(key, value); } catch {}
  },
};

// ── API call (proxied through /api/agent) ────────────────────────────────────
async function callAgent(userMessage, inventory) {
  const inventoryStr = inventory
    .map(i => `[${i.id}] ${i.name} | Qty: ${i.qty} ${i.unit} | Min: ${i.min} ${i.unit} | ${i.location}`)
    .join("\n");

  const prompt = `Current Inventory:\n${inventoryStr}\n\nUser Message: "${userMessage}"`;

  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await res.json();
  const text = data.content?.map(b => b.text || "").join("") || "{}";
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return { action: "CHITCHAT", reply: text, updates: [], flags: [], highlight: null };
  }
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function LabSupplyAgent() {
  const [inventory, setInventory] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(null);
  const [activeTab, setActiveTab] = useState("chat");
  const [filterCat, setFilterCat] = useState("All");
  const [orders, setOrders] = useState([]);
  const [orderForm, setOrderForm] = useState({ itemId: "", qty: "", requester: "", urgency: "routine", notes: "" });
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const chatEndRef = useRef(null);

  // Load or seed from localStorage
  useEffect(() => {
    const stored = storage.get("lab-inventory");
    if (stored?.value) {
      setInventory(JSON.parse(stored.value));
    } else {
      setInventory(SEED_INVENTORY);
      storage.set("lab-inventory", JSON.stringify(SEED_INVENTORY));
    }
    const msgs = storage.get("lab-messages");
    if (msgs?.value) setMessages(JSON.parse(msgs.value));
    const ords = storage.get("lab-orders");
    if (ords?.value) setOrders(JSON.parse(ords.value));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const saveInventory = (inv) => {
    setInventory(inv);
    storage.set("lab-inventory", JSON.stringify(inv));
  };

  const saveMessages = (msgs) => {
    setMessages(msgs);
    storage.set("lab-messages", JSON.stringify(msgs.slice(-50)));
  };

  const saveOrders = (ords) => {
    setOrders(ords);
    storage.set("lab-orders", JSON.stringify(ords.slice(-100)));
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", text: input, ts: new Date().toLocaleTimeString() };
    const updatedMsgs = [...messages, userMsg];
    saveMessages(updatedMsgs);
    setInput("");
    setLoading(true);

    try {
      const result = await callAgent(input, inventory);
      let newInv = [...inventory];
      if (result.updates?.length) {
        newInv = newInv.map(item => {
          const upd = result.updates.find(u => u.id === item.id);
          if (upd) return { ...item, qty: Math.max(0, item.qty + upd.delta) };
          return item;
        });
        saveInventory(newInv);
      }
      if (result.highlight) {
        setHighlight(result.highlight);
        setTimeout(() => setHighlight(null), 3000);
      }
      saveMessages([...updatedMsgs, {
        role: "agent", text: result.reply, action: result.action,
        flags: result.flags || [], ts: new Date().toLocaleTimeString(),
      }]);
    } catch {
      saveMessages([...updatedMsgs, {
        role: "agent", text: "⚠️ Agent error. Check console.", action: "ERROR",
        flags: [], ts: new Date().toLocaleTimeString()
      }]);
    }
    setLoading(false);
  };

  const submitOrder = async () => {
    if (!orderForm.itemId || !orderForm.qty || !orderForm.requester) return;
    const item = inventory.find(i => i.id === orderForm.itemId);
    if (!item) return;
    setOrderSubmitting(true);
    const qty = parseFloat(orderForm.qty);
    const msg = `Order ${qty} ${item.unit} of ${item.name} for ${orderForm.requester}, ${orderForm.urgency}${orderForm.notes ? ". Note: " + orderForm.notes : ""}`;
    try {
      const result = await callAgent(msg, inventory);
      let newInv = [...inventory];
      if (result.updates?.length) {
        newInv = newInv.map(itm => {
          const upd = result.updates.find(u => u.id === itm.id);
          if (upd) return { ...itm, qty: Math.max(0, itm.qty + upd.delta) };
          return itm;
        });
        saveInventory(newInv);
      }
      const newOrder = {
        id: `ORD-${Date.now()}`,
        itemId: item.id, itemName: item.name,
        qty, unit: item.unit,
        requester: orderForm.requester,
        urgency: orderForm.urgency,
        notes: orderForm.notes,
        status: result.flags?.length ? "warned" : "approved",
        agentReply: result.reply,
        flags: result.flags || [],
        ts: new Date().toLocaleString(),
      };
      saveOrders([newOrder, ...orders]);
      setOrderSuccess(newOrder);
      setOrderForm({ itemId: "", qty: "", requester: "", urgency: "routine", notes: "" });
    } catch {
      setOrderSuccess({ status: "error", agentReply: "Agent error — please try again.", flags: [] });
    }
    setOrderSubmitting(false);
  };

  const lowStock = inventory.filter(i => i.qty <= i.min);
  const categories = ["All", ...new Set(inventory.map(i => i.category))];
  const filteredInv = filterCat === "All" ? inventory : inventory.filter(i => i.category === filterCat);

  const actionColor = {
    ORDER: "#f59e0b", RECEIVE: "#10b981", CHECK: "#6366f1",
    ADJUST: "#3b82f6", REPORT: "#8b5cf6", CHITCHAT: "#64748b", ERROR: "#ef4444"
  };

  return (
    <div style={{
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      background: "#0a0e1a", minHeight: "100vh", color: "#c9d1e8",
      display: "flex", flexDirection: "column",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0a0e1a; }
        ::-webkit-scrollbar-thumb { background: #1e2a45; border-radius: 2px; }
        select option { background: #111827; color: #c9d1e8; }
      `}</style>

      {/* Header */}
      <div style={{
        borderBottom: "1px solid #1e2a45", padding: "14px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#0d1220",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: "linear-gradient(135deg, #2563eb, #06b6d4)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>🧪</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "0.05em", color: "#e2e8f0" }}>
              LAB SUPPLY AGENT
            </div>
            <div style={{ fontSize: 10, color: "#4a5878", letterSpacing: "0.1em" }}>
              R&D INVENTORY · ORDER MANAGEMENT
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
          <span style={{ color: "#10b981" }}>● {inventory.length} ITEMS</span>
          {lowStock.length > 0 && <span style={{ color: "#f59e0b" }}>⚠ {lowStock.length} LOW</span>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1e2a45", background: "#0d1220", padding: "0 24px" }}>
        {["chat", "orders", "inventory"].map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setOrderSuccess(null); }} style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "10px 16px", fontSize: 11, letterSpacing: "0.1em",
            color: activeTab === tab ? "#38bdf8" : "#4a5878",
            borderBottom: activeTab === tab ? "2px solid #38bdf8" : "2px solid transparent",
            textTransform: "uppercase", fontFamily: "inherit",
          }}>
            {tab === "chat" ? "🤖 Agent Chat" : tab === "orders" ? "🧾 Place Order" : "📦 Inventory"}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── CHAT TAB ── */}
        {activeTab === "chat" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{
              padding: "10px 20px", display: "flex", gap: 8, flexWrap: "wrap",
              borderBottom: "1px solid #1e2a45", background: "#0d1220",
            }}>
              {[
                "Order 50g BSA for Sarah, urgent",
                "We received 5L of PBS 10x",
                "What's our Taq Polymerase stock?",
                "Show low stock report",
              ].map(q => (
                <button key={q} onClick={() => setInput(q)} style={{
                  background: "#111827", border: "1px solid #1e2a45", borderRadius: 4,
                  color: "#6b7fa8", fontSize: 10, padding: "4px 10px", cursor: "pointer",
                  fontFamily: "inherit", letterSpacing: "0.05em",
                }}>{q}</button>
              ))}
            </div>

            <div style={{
              flex: 1, overflowY: "auto", padding: "20px 24px",
              display: "flex", flexDirection: "column", gap: 12,
            }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", color: "#2a3a5c", marginTop: 60, fontSize: 13, lineHeight: 2 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
                  <div style={{ color: "#4a6080" }}>Lab Supply Agent ready.</div>
                  <div style={{ fontSize: 11, color: "#2a3a5c" }}>Try: "Order 100mL DMSO for Jake" or "Show inventory report"</div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{
                  display: "flex", flexDirection: m.role === "user" ? "row-reverse" : "row",
                  gap: 10, alignItems: "flex-start",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                    background: m.role === "user" ? "#1d4ed8" : "#1e2a45",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
                  }}>{m.role === "user" ? "👤" : "🤖"}</div>
                  <div style={{ maxWidth: "72%" }}>
                    <div style={{
                      background: m.role === "user" ? "#1a2744" : "#111827",
                      border: `1px solid ${m.role === "user" ? "#1d4ed8" : "#1e2a45"}`,
                      borderRadius: 8, padding: "10px 14px", fontSize: 12, lineHeight: 1.6, color: "#c9d1e8",
                    }}>
                      {m.action && m.action !== "CHITCHAT" && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                          color: actionColor[m.action] || "#64748b", display: "block", marginBottom: 4,
                        }}>{m.action}</span>
                      )}
                      {m.text}
                      {m.flags?.map(f => (
                        <div key={f} style={{
                          marginTop: 6, fontSize: 10, color: "#f59e0b",
                          background: "#1c1500", padding: "3px 8px",
                          borderRadius: 4, borderLeft: "2px solid #f59e0b",
                        }}>⚠ {f}</div>
                      ))}
                    </div>
                    <div style={{ fontSize: 9, color: "#2a3a5c", marginTop: 3, textAlign: m.role === "user" ? "right" : "left" }}>
                      {m.ts}
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 6, background: "#1e2a45",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
                  }}>🤖</div>
                  <div style={{ background: "#111827", border: "1px solid #1e2a45", borderRadius: 8, padding: "10px 16px", fontSize: 12, color: "#4a5878" }}>
                    <span style={{ animation: "pulse 1.2s infinite" }}>processing...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div style={{ padding: "14px 20px", borderTop: "1px solid #1e2a45", background: "#0d1220", display: "flex", gap: 10 }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMessage()}
                placeholder="e.g. Order 200mg ATP for Maria, urgent..."
                style={{
                  flex: 1, background: "#111827", border: "1px solid #1e2a45",
                  borderRadius: 6, padding: "10px 14px", color: "#c9d1e8",
                  fontFamily: "inherit", fontSize: 12, outline: "none",
                }}
              />
              <button onClick={sendMessage} disabled={loading} style={{
                background: loading ? "#1e2a45" : "linear-gradient(135deg, #2563eb, #06b6d4)",
                border: "none", borderRadius: 6, padding: "10px 18px",
                color: "#fff", cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              }}>
                {loading ? "..." : "SEND →"}
              </button>
            </div>
          </div>
        )}

        {/* ── ORDERS TAB ── */}
        {activeTab === "orders" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 340px", background: "#0d1220", border: "1px solid #1e2a45", borderRadius: 10, padding: "20px 24px" }}>
              <div style={{ fontSize: 11, color: "#38bdf8", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 18 }}>NEW R&D ORDER</div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 10, color: "#4a5878", letterSpacing: "0.08em", display: "block", marginBottom: 5 }}>REAGENT / ITEM *</label>
                <select value={orderForm.itemId} onChange={e => setOrderForm(f => ({ ...f, itemId: e.target.value }))} style={{
                  width: "100%", background: "#111827", border: "1px solid #1e2a45",
                  borderRadius: 5, padding: "9px 12px", color: orderForm.itemId ? "#c9d1e8" : "#3a4d6a",
                  fontFamily: "inherit", fontSize: 11, outline: "none",
                }}>
                  <option value="">— Select item —</option>
                  {inventory.map(i => (
                    <option key={i.id} value={i.id}>{i.name} ({i.qty} {i.unit} avail)</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: "#4a5878", letterSpacing: "0.08em", display: "block", marginBottom: 5 }}>QUANTITY *</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="number" min="0" value={orderForm.qty}
                      onChange={e => setOrderForm(f => ({ ...f, qty: e.target.value }))}
                      placeholder="0"
                      style={{
                        flex: 1, background: "#111827", border: "1px solid #1e2a45",
                        borderRadius: 5, padding: "9px 10px", color: "#c9d1e8",
                        fontFamily: "inherit", fontSize: 11, outline: "none", width: "100%",
                      }}
                    />
                    {orderForm.itemId && (
                      <span style={{ fontSize: 10, color: "#4a5878", whiteSpace: "nowrap" }}>
                        {inventory.find(i => i.id === orderForm.itemId)?.unit}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: "#4a5878", letterSpacing: "0.08em", display: "block", marginBottom: 5 }}>REQUESTER *</label>
                  <input value={orderForm.requester}
                    onChange={e => setOrderForm(f => ({ ...f, requester: e.target.value }))}
                    placeholder="Your name"
                    style={{
                      width: "100%", background: "#111827", border: "1px solid #1e2a45",
                      borderRadius: 5, padding: "9px 10px", color: "#c9d1e8",
                      fontFamily: "inherit", fontSize: 11, outline: "none",
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 10, color: "#4a5878", letterSpacing: "0.08em", display: "block", marginBottom: 5 }}>URGENCY</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["routine", "urgent", "ASAP"].map(u => (
                    <button key={u} onClick={() => setOrderForm(f => ({ ...f, urgency: u }))} style={{
                      flex: 1,
                      background: orderForm.urgency === u ? (u === "ASAP" ? "#1a0505" : u === "urgent" ? "#1a1000" : "#051a2f") : "#111827",
                      border: `1px solid ${orderForm.urgency === u ? (u === "ASAP" ? "#ef4444" : u === "urgent" ? "#f59e0b" : "#3b82f6") : "#1e2a45"}`,
                      borderRadius: 4, padding: "7px 0",
                      color: orderForm.urgency === u ? (u === "ASAP" ? "#ef4444" : u === "urgent" ? "#f59e0b" : "#60a5fa") : "#3a4d6a",
                      fontSize: 10, fontWeight: 700, cursor: "pointer",
                      fontFamily: "inherit", letterSpacing: "0.06em",
                    }}>{u.toUpperCase()}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 10, color: "#4a5878", letterSpacing: "0.08em", display: "block", marginBottom: 5 }}>NOTES (optional)</label>
                <textarea value={orderForm.notes}
                  onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Experiment name, project, special instructions..."
                  rows={2}
                  style={{
                    width: "100%", background: "#111827", border: "1px solid #1e2a45",
                    borderRadius: 5, padding: "9px 12px", color: "#c9d1e8",
                    fontFamily: "inherit", fontSize: 11, outline: "none", resize: "vertical",
                  }}
                />
              </div>

              <button onClick={submitOrder}
                disabled={orderSubmitting || !orderForm.itemId || !orderForm.qty || !orderForm.requester}
                style={{
                  width: "100%",
                  background: (orderSubmitting || !orderForm.itemId || !orderForm.qty || !orderForm.requester) ? "#1e2a45" : "linear-gradient(135deg, #2563eb, #06b6d4)",
                  border: "none", borderRadius: 6, padding: "11px",
                  color: "#fff", cursor: "pointer", fontFamily: "inherit",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
                  opacity: (!orderForm.itemId || !orderForm.qty || !orderForm.requester) ? 0.4 : 1,
                }}>
                {orderSubmitting ? "SUBMITTING..." : "SUBMIT ORDER →"}
              </button>

              {orderSuccess && (
                <div style={{
                  marginTop: 16, background: "#111827",
                  border: `1px solid ${orderSuccess.status === "error" ? "#3b0a0a" : orderSuccess.status === "warned" ? "#3b2200" : "#0a3b1f"}`,
                  borderRadius: 6, padding: "12px 14px",
                }}>
                  <div style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 5,
                    color: orderSuccess.status === "error" ? "#ef4444" : orderSuccess.status === "warned" ? "#f59e0b" : "#10b981",
                  }}>
                    {orderSuccess.status === "error" ? "⚠ ERROR" : orderSuccess.status === "warned" ? "⚠ APPROVED WITH WARNING" : "✓ ORDER APPROVED"}
                  </div>
                  <div style={{ fontSize: 11, color: "#c9d1e8", lineHeight: 1.6 }}>{orderSuccess.agentReply}</div>
                  {orderSuccess.flags?.map(f => (
                    <div key={f} style={{ marginTop: 6, fontSize: 10, color: "#f59e0b", borderLeft: "2px solid #f59e0b", paddingLeft: 8 }}>⚠ {f}</div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ flex: "1 1 340px", background: "#0d1220", border: "1px solid #1e2a45", borderRadius: 10, padding: "20px 24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#38bdf8", letterSpacing: "0.12em", fontWeight: 700 }}>ORDER HISTORY</div>
                <span style={{ fontSize: 10, color: "#3a4d6a" }}>{orders.length} orders</span>
              </div>
              {orders.length === 0 ? (
                <div style={{ textAlign: "center", color: "#2a3a5c", padding: "40px 0", fontSize: 11 }}>No orders yet</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 480, overflowY: "auto" }}>
                  {orders.map(o => (
                    <div key={o.id} style={{
                      background: "#111827", border: "1px solid #1e2a45", borderRadius: 6, padding: "10px 14px",
                      borderLeft: `3px solid ${o.status === "error" ? "#ef4444" : o.status === "warned" ? "#f59e0b" : "#10b981"}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: "#c9d1e8", fontWeight: 600 }}>{o.itemName}</span>
                        <span style={{
                          fontSize: 9, padding: "2px 6px", borderRadius: 3, fontWeight: 700,
                          background: o.urgency === "ASAP" ? "#1a0505" : o.urgency === "urgent" ? "#1a1000" : "#111827",
                          color: o.urgency === "ASAP" ? "#ef4444" : o.urgency === "urgent" ? "#f59e0b" : "#4a5878",
                          border: `1px solid ${o.urgency === "ASAP" ? "#3b0a0a" : o.urgency === "urgent" ? "#3b2200" : "#1e2a45"}`,
                        }}>{o.urgency.toUpperCase()}</span>
                      </div>
                      <div style={{ fontSize: 10, color: "#4a5878" }}>{o.qty} {o.unit} · {o.requester} · {o.ts}</div>
                      {o.notes && <div style={{ fontSize: 10, color: "#3a4d6a", marginTop: 3, fontStyle: "italic" }}>{o.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── INVENTORY TAB ── */}
        {activeTab === "inventory" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{
              padding: "10px 20px", display: "flex", gap: 8, alignItems: "center",
              borderBottom: "1px solid #1e2a45", background: "#0d1220", flexWrap: "wrap",
            }}>
              {categories.map(c => (
                <button key={c} onClick={() => setFilterCat(c)} style={{
                  background: filterCat === c ? "#1d4ed8" : "#111827",
                  border: `1px solid ${filterCat === c ? "#3b82f6" : "#1e2a45"}`,
                  borderRadius: 4, color: filterCat === c ? "#fff" : "#4a5878",
                  fontSize: 10, padding: "4px 10px", cursor: "pointer",
                  fontFamily: "inherit", letterSpacing: "0.05em",
                }}>{c.toUpperCase()}</button>
              ))}
              <button onClick={() => { saveInventory(SEED_INVENTORY); saveMessages([]); saveOrders([]); }} style={{
                marginLeft: "auto", background: "#1a0a0a", border: "1px solid #3b1515",
                borderRadius: 4, color: "#7a3535", fontSize: 10, padding: "4px 10px",
                cursor: "pointer", fontFamily: "inherit",
              }}>↺ Reset Demo</button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e2a45", color: "#3a4d6a", letterSpacing: "0.1em" }}>
                    {["ID", "NAME", "CATEGORY", "QTY", "MIN", "LOCATION", "STATUS"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredInv.map(item => {
                    const isLow = item.qty <= item.min;
                    const isCritical = item.qty <= item.min * 0.5;
                    const isHighlighted = highlight === item.id;
                    return (
                      <tr key={item.id} style={{
                        borderBottom: "1px solid #111827",
                        background: isHighlighted ? "#0c1f3a" : "transparent",
                        transition: "background 0.4s",
                      }}>
                        <td style={{ padding: "9px 12px", color: "#3b82f6", fontWeight: 600 }}>{item.id}</td>
                        <td style={{ padding: "9px 12px", color: "#c9d1e8" }}>{item.name}</td>
                        <td style={{ padding: "9px 12px" }}>
                          <span style={{
                            background: "#111827", border: "1px solid #1e2a45",
                            borderRadius: 3, padding: "2px 6px", fontSize: 9, color: "#6b7fa8", letterSpacing: "0.08em",
                          }}>{item.category.toUpperCase()}</span>
                        </td>
                        <td style={{ padding: "9px 12px", fontWeight: 700, color: isCritical ? "#ef4444" : isLow ? "#f59e0b" : "#10b981" }}>
                          {item.qty} {item.unit}
                        </td>
                        <td style={{ padding: "9px 12px", color: "#3a4d6a" }}>{item.min} {item.unit}</td>
                        <td style={{ padding: "9px 12px", color: "#4a5878" }}>{item.location}</td>
                        <td style={{ padding: "9px 12px" }}>
                          <span style={{
                            fontSize: 9, padding: "3px 8px", borderRadius: 3, fontWeight: 700, letterSpacing: "0.08em",
                            background: isCritical ? "#1a0505" : isLow ? "#1a1000" : "#051a0f",
                            color: isCritical ? "#ef4444" : isLow ? "#f59e0b" : "#10b981",
                            border: `1px solid ${isCritical ? "#3b0a0a" : isLow ? "#3b2200" : "#0a3b1f"}`,
                          }}>
                            {isCritical ? "⚠ CRITICAL" : isLow ? "↓ LOW" : "✓ OK"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {lowStock.length > 0 && (
              <div style={{ padding: "10px 20px", background: "#110d00", borderTop: "1px solid #2a1a00", fontSize: 11, color: "#a07020" }}>
                ⚠ LOW STOCK: {lowStock.map(i => i.name).join(" · ")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
