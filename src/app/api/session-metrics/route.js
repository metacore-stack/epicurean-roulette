import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabaseServer";

export const revalidate = 0;

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body || !body.action) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const client = getSupabaseServiceClient();
  if (!client) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const payload = {
    user_id: body.userId ?? null,
    session_code: body.sessionCode ?? null,
    action: body.action,
    restaurant_name: body.restaurant?.name ?? null,
    restaurant_data: body.restaurant ?? null,
    metadata: body.metadata ?? null,
  };

  const { error } = await client.from("session_metrics").insert(payload);

  if (error) {
    console.error("session_metric_error", error);
    return NextResponse.json({ error: "Failed to record metric" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
