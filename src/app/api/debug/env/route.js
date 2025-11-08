import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
	return NextResponse.json({
		hasSupabaseUrl: !!process.env.SUPABASE_URL,
		hasSupabaseServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
		hasSupabaseAnon: !!process.env.SUPABASE_ANON_KEY,
	});
}
