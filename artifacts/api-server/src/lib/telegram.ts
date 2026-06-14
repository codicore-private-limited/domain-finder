import { logger } from "./logger";
import { DIAMOND_THRESHOLD } from "./news/llm-diamond-filter";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

const CATEGORY_EMOJI: Record<string, string> = {
  ai: "🤖",
  quantum: "⚛️",
  biotech: "🧬",
  green_energy: "⚡",
  space_tech: "🚀",
};

const TIER_EMOJI: Record<string, string> = {
  "S-TIER": "💎💎💎",
  "A-TIER": "💎💎",
  "B-TIER": "💎",
};

function getTier(score: number): string {
  if (score >= 96) return "S-TIER";
  if (score >= 90) return "A-TIER";
  return "B-TIER";
}

function getFlipValue(score: number, len: number): string {
  if (score >= 96 && len <= 5) return "$20,000–$80,000";
  if (score >= 96 && len === 6) return "$15,000–$50,000";
  if (score >= 96) return "$10,000–$40,000";
  if (score >= 90 && len <= 5) return "$10,000–$30,000";
  if (score >= 90 && len === 6) return "$8,000–$25,000";
  return "$5,000–$15,000";
}

function getCategoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    ai: "Artificial Intelligence",
    quantum: "Quantum Computing",
    biotech: "Biotechnology",
    green_energy: "Green Energy",
    space_tech: "Space Technology",
  };
  return labels[cat] ?? cat;
}

function getBuyerPersona(cat: string, name: string): string {
  const personas: Record<string, string> = {
    ai: "AI agent startups, LLM platforms, enterprise AI SaaS",
    quantum: "Quantum computing firms, D-Wave/IBM-adjacent startups",
    biotech: "Gene therapy cos, CRISPR labs, pharma-tech ventures",
    green_energy: "EV/battery startups, solar/wind tech, clean-grid SaaS",
    space_tech: "SpaceX suppliers, satellite cos, space-tourism brands",
  };
  return personas[cat] ?? "Deep-tech startups, Fortune 500 ventures";
}

export interface TelegramAlertPayload {
  name: string;
  fqdn: string;
  category: string;
  strategy: string;
  valueScore: number;
  pattern: string;
  rationale: string;
  dnsEvidence?: string;
}

let alertQueue: TelegramAlertPayload[] = [];
let flushing = false;
let lastFlush = 0;
const FLUSH_INTERVAL_MS = 3000;
const MAX_BATCH = 3;

async function sendTelegramMessage(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) {
    logger.warn("Telegram not configured — skipping alert");
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.warn({ status: res.status, body: body.slice(0, 200) }, "Telegram send failed");
    }
  } catch (err) {
    logger.warn({ err }, "Telegram fetch error");
  }
}

function buildAlertMessage(payload: TelegramAlertPayload): string {
  const { name, fqdn, category, valueScore, pattern, rationale } = payload;
  const tier = getTier(valueScore);
  const tierEmoji = TIER_EMOJI[tier] ?? "💎";
  const catEmoji = CATEGORY_EMOJI[category] ?? "🔬";
  const flipValue = getFlipValue(valueScore, name.length);
  const buyer = getBuyerPersona(category, name);
  const catLabel = getCategoryLabel(category);

  return [
    `${tierEmoji} <b>DIAMOND ALERT — ${fqdn.toUpperCase()}</b>`,
    ``,
    `📊 <b>Score:</b> ${valueScore}/100 (${tier})`,
    `🔤 <b>Pattern:</b> ${pattern} · ${name.length} letters`,
    `${catEmoji} <b>Sector:</b> ${catLabel}`,
    ``,
    `<b>💰 Flip Value:</b> ${flipValue}`,
    `<b>🎯 Buyer Persona:</b> ${buyer}`,
    ``,
    `<b>📝 Why It's a Diamond:</b>`,
    rationale,
    ``,
    `<b>🔗 Register Now:</b>`,
    `• <a href="https://www.namecheap.com/domains/registration/results/?domain=${fqdn}">Namecheap</a>`,
    `• <a href="https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${fqdn}">GoDaddy</a>`,
    `• <a href="https://www.name.com/domain/search/${fqdn}">Name.com</a>`,
    ``,
    `⚡ <i>RDAP-verified · Verisign confirmed unregistered · Act fast!</i>`,
  ].join("\n");
}

async function flushQueue(): Promise<void> {
  if (flushing || alertQueue.length === 0) return;
  const now = Date.now();
  if (now - lastFlush < FLUSH_INTERVAL_MS) return;
  flushing = true;
  lastFlush = now;
  try {
    const batch = alertQueue.splice(0, MAX_BATCH);
    for (const payload of batch) {
      await sendTelegramMessage(buildAlertMessage(payload));
      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    flushing = false;
  }
}

setInterval(() => {
  if (alertQueue.length > 0) void flushQueue();
}, FLUSH_INTERVAL_MS);

export function queueTelegramAlert(payload: TelegramAlertPayload): void {
  if (!BOT_TOKEN || !CHAT_ID) return;
  alertQueue.push(payload);
  if (alertQueue.length > 50) alertQueue = alertQueue.slice(-50);
}

export interface ExpiringAlertPayload {
  fqdn: string;
  phase: string; // "expiring" | "redemption" | "pendingDelete"
  expirationDate?: string | null;
  valueReason?: string | null;
  valueBand?: string | null;
  realisticUsd?: string | null;
}

/**
 * Alert for a HIGH-VALUE domain heading toward release. This is the realistic
 * crore-grade source: catch a good name the moment it drops. Sent immediately
 * (not queued) because drop timing is sensitive.
 */
export async function sendExpiringAlert(payload: ExpiringAlertPayload): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;
  const phaseLabel: Record<string, string> = {
    expiring: "⏳ EXPIRING SOON",
    redemption: "♻️ REDEMPTION PERIOD",
    pendingDelete: "🗑️ PENDING DELETE (drops soon)",
    dropping: "🚨 DROPPING",
  };
  const head = phaseLabel[payload.phase] ?? "⏳ EXPIRING";
  const exp = payload.expirationDate
    ? new Date(payload.expirationDate).toISOString().slice(0, 10)
    : "unknown";
  const lines = [
    `${head} — <b>${payload.fqdn.toUpperCase()}</b>`,
    ``,
    `📅 <b>Expiry:</b> ${exp}`,
    payload.valueReason ? `💡 <b>Why valuable:</b> ${payload.valueReason}` : "",
    payload.valueBand
      ? `💰 <b>Realistic value:</b> ${payload.valueBand}${payload.realisticUsd ? ` (${payload.realisticUsd})` : ""}`
      : "",
    ``,
    `<b>🎯 Action:</b> This name is TAKEN now but heading toward release.`,
    `To actually win it on drop, set a backorder:`,
    `• <a href="https://www.dropcatch.com/domain/${payload.fqdn}">DropCatch</a>`,
    `• <a href="https://www.snapnames.com/searchresult.action?searchTerm=${payload.fqdn}">SnapNames</a>`,
    `• <a href="https://www.godaddy.com/domain-value-appraisal/${payload.fqdn}">GoDaddy Backorder</a>`,
    ``,
    `⚠️ <i>Honest note: drops are competitive — a backorder service is usually required to win a good name. No guarantee.</i>`,
  ].filter(Boolean);
  await sendTelegramMessage(lines.join("\n"));
}

export async function sendStartupAlert(diamondCount: number): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;
  const text = [
    `🚀 <b>Domain Hunter ARMED</b>`,
    ``,
    `⚙️ Scanning fresh .com registrations for investor-grade diamonds`,
    `💎 Current vault: <b>${diamondCount.toLocaleString()} names</b>`,
    `🎯 Alert rule: AI verdict = DIAMOND and score ≥ ${DIAMOND_THRESHOLD}`,
    `📡 Categories: AI · Quantum · Biotech · Green Energy · Space-Tech`,
    ``,
    `<i>You'll be notified instantly when an AI-verified diamond is found.</i>`,
  ].join("\n");
  await sendTelegramMessage(text);
}

export async function testTelegramConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN || !CHAT_ID) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set" };
  }
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getMe`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { ok: boolean; result?: { username: string } };
    if (!data.ok) return { ok: false, error: "Telegram API returned ok=false" };
    await sendTelegramMessage(
      `✅ <b>Domain Hunter connected!</b>\n\nBot: @${data.result?.username ?? "unknown"}\nAlerts will be sent here for AI-verified diamonds (score ≥ ${DIAMOND_THRESHOLD}).`,
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
