import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const TABLE = "group_session_events";
const EVENT_TYPE = "state_snapshot";

// Simple in-memory fallback so local dev without Supabase still works across tabs while server stays warm
const memoryStore = (() => {
	if (!globalThis.__dd_group_state_store) {
		globalThis.__dd_group_state_store = new Map();
	}
	return globalThis.__dd_group_state_store;
})();

export async function GET(request) {
	const { searchParams } = new URL(request.url);
	const code = searchParams.get("code");
	if (!code) {
		return NextResponse.json({ error: "missing_code" }, { status: 400 });
	}

	try {
		const supabase = getSupabaseServiceClient();
		if (!supabase) {
			console.info("group_state_supabase_missing_env", {
				hasUrl: !!process.env.SUPABASE_URL,
				hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
				hasAnonKey: !!process.env.SUPABASE_ANON_KEY,
			});
			const snapshot = memoryStore.get(code) || null;
			return NextResponse.json({ session: snapshot, fallback: true }, { status: 200 });
		}

		const { data, error } = await supabase
			.from(TABLE)
			.select("payload")
			.eq("session_code", code)
			.eq("event_type", EVENT_TYPE)
			.order("created_at", { ascending: false })
			.limit(1);

		if (error) {
			console.warn("group_state_fetch_error", error);
			const snapshot = memoryStore.get(code) || null;
			return NextResponse.json({ session: snapshot, fallback: true }, { status: 200 });
		}

		const payload = data?.[0]?.payload || null;
		return NextResponse.json({ session: payload?.session || null }, { status: 200 });
	} catch (err) {
		console.warn("group_state_fetch_unhandled", err);
		const snapshot = memoryStore.get(code) || null;
		return NextResponse.json({ session: snapshot, fallback: true }, { status: 200 });
	}
}

export async function POST(request) {
	let body;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "invalid_json" }, { status: 400 });
	}

	const code = typeof body?.code === "string" ? body.code.trim() : "";
	const session = body?.session;

	if (!code || !session || typeof session !== "object") {
		return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
	}

	try {
		const supabase = getSupabaseServiceClient();
		if (!supabase) {
			console.info("group_state_supabase_missing_env", {
				hasUrl: !!process.env.SUPABASE_URL,
				hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
				hasAnonKey: !!process.env.SUPABASE_ANON_KEY,
			});
			memoryStore.set(code, session);
			return NextResponse.json({ ok: true, fallback: true }, { status: 200 });
		}
		const { error } = await supabase.from(TABLE).insert({
			session_code: code,
			event_type: EVENT_TYPE,
			payload: { session },
		});
		if (error) {
			console.warn("group_state_insert_error", error);
			memoryStore.set(code, session);
			return NextResponse.json({ ok: true, fallback: true }, { status: 200 });
		}
		return NextResponse.json({ ok: true }, { status: 201 });
	} catch (err) {
		console.warn("group_state_insert_unhandled", err);
		memoryStore.set(code, session);
		return NextResponse.json({ ok: true, fallback: true }, { status: 200 });
	}
}
