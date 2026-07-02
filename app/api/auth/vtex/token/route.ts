import { NextResponse } from "next/server";
import { buildDummyResponse } from "@/lib/dummy-response";

export async function POST() {
  return NextResponse.json(buildDummyResponse("token"));
}
