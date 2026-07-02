import { NextResponse } from "next/server";
import { buildDummyResponse } from "@/lib/dummy-response";

export async function GET() {
  return NextResponse.json({
    ...buildDummyResponse("userinfo"),
    userId: "dummy-user",
    email: "dummy@example.com",
    name: "Dummy User",
  });
}
