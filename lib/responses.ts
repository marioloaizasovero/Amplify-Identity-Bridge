import { NextResponse } from "next/server";
import { buildDummyResponse } from "@/lib/dummy-response";

export function dummyJson(endpoint: string) {
  return NextResponse.json(buildDummyResponse(endpoint));
}

export function dummyError(endpoint: string, status = 400) {
  return NextResponse.json(
    {
      ...buildDummyResponse(endpoint),
      ok: false,
      error: "Dummy error response.",
    },
    { status },
  );
}

export function dummyRedirect(path = "/") {
  return NextResponse.redirect(new URL(path, "http://localhost:3000"));
}
