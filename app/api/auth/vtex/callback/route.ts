import { NextResponse } from "next/server";
import { buildDummyResponse } from "@/lib/dummy-response";

export async function GET() {
  return NextResponse.json(buildDummyResponse("callback"));
}
