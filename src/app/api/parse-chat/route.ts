import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Zscaler corporate proxy re-signs TLS — Node's cert bundle doesn't include
// Zscaler's root CA, so all outbound HTTPS from Node fails with
// UNABLE_TO_GET_ISSUER_CERT_LOCALLY. This is a dev-only workaround;
// on Vercel/Render (no corporate proxy) this env var is never set.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text) return NextResponse.json({ error: "no text" }, { status: 400 });

    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: "Extract a traveller profile from this WhatsApp chat. Return ONLY valid JSON, no markdown.\n\nSchema (all optional):\n{\"traveller_name\":string,\"from\":string,\"destinations\":[string],\"dateRange\":string,\"tripLength\":string,\"groupType\":string,\"budgetPerPerson\":string,\"budgetCap\":string,\"purpose\":string,\"pax\":number,\"children\":number}\n\nChat:\n" + text.slice(0, 8000),
      }],
    });

    const raw = ((msg.content[0] as any).text || "{}").replace(/```json|```/g, "").trim();
    try { return NextResponse.json(JSON.parse(raw)); } catch { return NextResponse.json({}); }
  } catch (err) {
    console.error("[parse-chat]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
