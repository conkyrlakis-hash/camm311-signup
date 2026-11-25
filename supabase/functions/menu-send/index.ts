// CUT menu engineering: save a sign-up and e-mail the workbook at once (Resend).
// Public endpoint (no JWT). Guards: honeypot, e-mail format, max 3 sends per address, max 300 sends per day.
import { createClient } from "npm:@supabase/supabase-js@2";
import { EN_XLSX, GR_XLSX } from "./files.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  if (b.website) return json({ ok: true }); // honeypot: pretend success
  const name = String(b.name ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  const lang = b.lang === "gr" ? "gr" : b.lang === "en" ? "en" : "";
  if (!name || name.length > 120) return json({ error: "name" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return json({ error: "email" }, 400);
  if (!lang) return json({ error: "lang" }, 400);
  if (b.consent !== true) return json({ error: "consent" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count: dayCount } = await db.from("cut_menu_signups").select("id", { count: "exact", head: true }).gte("created_at", since);
  if ((dayCount ?? 0) >= 300) return json({ error: "busy" }, 429);
  const { count: mine } = await db.from("cut_menu_signups").select("id", { count: "exact", head: true }).eq("email", email);
  if ((mine ?? 0) >= 3) return json({ error: "limit" }, 429);

  const { data: row, error: insErr } = await db.from("cut_menu_signups")
    .insert({ name, email, lang, consent: true }).select("id").single();
  if (insErr || !row) return json({ error: "save" }, 500);

  const gr = lang === "gr";
  const first = esc(name.split(/\s+/)[0]);
  const subject = gr ? "Menu Engineering: το αρχείο Excel του μαθήματος" : "Menu Engineering: your course Excel workbook";
  const html = gr
    ? `<p>Γεια σου ${first},</p><p>Συνημμένο το αρχείο Excel για το Menu Engineering που είδαμε στο μάθημα. Τα ονόματα των πιάτων είναι στα αγγλικά, όλα τα υπόλοιπα στα ελληνικά.</p><p>Οι ομάδες: <b>Αστέρι</b> (υψηλή δημοφιλία, υψηλό κέρδος), <b>Άλογο Έλξης</b> (υψηλή δημοφιλία, χαμηλό κέρδος), <b>Αίνιγμα</b> (χαμηλή δημοφιλία, υψηλό κέρδος), <b>Σκύλος</b> (χαμηλά και τα δύο).</p><p>Κωνσταντίνος Κυρλάκης<br>CAMM 311</p>`
    : `<p>Hello ${first},</p><p>Attached is the Menu Engineering Excel workbook we used in class. Dish names and all labels are in English.</p><p>The groups: <b>Star</b> (high popularity, high profit), <b>Plow-horse</b> (high popularity, low profit), <b>Puzzle</b> (low popularity, high profit), <b>Dog</b> (low on both).</p><p>Constantinos Kyrlakis<br>CAMM 311</p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Constantinos Kyrlakis <noreply@runproops.com>",
      reply_to: "info@proinsights.com.cy",
      to: [email],
      subject,
      html,
      attachments: [{
        filename: gr ? "Menu-Engineering_GR.xlsx" : "Menu-Engineering_EN.xlsx",
        content: gr ? GR_XLSX : EN_XLSX,
      }],
    }),
  });
  if (!res.ok) {
    const t = (await res.text()).slice(0, 300);
    await db.from("cut_menu_signups").update({ send_error: `${res.status} ${t}` }).eq("id", row.id);
    return json({ error: "send" }, 502);
  }
  await db.from("cut_menu_signups").update({ sent_at: new Date().toISOString() }).eq("id", row.id);
  return json({ ok: true });
});
