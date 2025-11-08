import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabaseServer";

export const revalidate = 0;

function normalizeProfile(input = {}) {
  return {
    user_id: input.userId,
    username: input.username ?? null,
    tier: input.tier ?? "free",
    ai_summary: input.aiSummary ?? null,
    preferences: input.preferences ?? null,
    insights: input.insights ?? null,
    last_active_at: input.lastActiveAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const client = getSupabaseServiceClient();
  if (!client) {
    return NextResponse.json({ profile: null, source: "no_supabase" }, { status: 200 });
  }

  const { data, error } = await client
    .from("profiles")
    .select("user_id,username,tier,ai_summary,preferences,insights,last_active_at,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("profile_fetch_error", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }

  const profile = data
    ? {
        userId: data.user_id,
        username: data.username,
        tier: data.tier,
        aiSummary: data.ai_summary,
        preferences: data.preferences,
        insights: data.insights,
        lastActiveAt: data.last_active_at,
        updatedAt: data.updated_at,
      }
    : null;

  return NextResponse.json({ profile, source: "supabase" }, { status: 200 });
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body || !body.userId) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const client = getSupabaseServiceClient();
  if (!client) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const payload = normalizeProfile(body);

  const { data, error } = await client
    .from("profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id,username,tier,ai_summary,preferences,insights,last_active_at,updated_at")
    .maybeSingle();

  if (error) {
    console.error("profile_upsert_error", error);
    return NextResponse.json({ error: "Failed to upsert profile" }, { status: 500 });
  }

  const profile = data
    ? {
        userId: data.user_id,
        username: data.username,
        tier: data.tier,
        aiSummary: data.ai_summary,
        preferences: data.preferences,
        insights: data.insights,
        lastActiveAt: data.last_active_at,
        updatedAt: data.updated_at,
      }
    : null;

  return NextResponse.json({ profile, source: "supabase" }, { status: 200 });
}
