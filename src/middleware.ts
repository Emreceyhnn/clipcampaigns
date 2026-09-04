import { NextResponse, type NextRequest } from "next/server";

// No real auth: a visitor with no userEmail cookie is signed in as admin.
const DEFAULT_ADMIN_EMAIL = "admin@example.com";

export function middleware(request: NextRequest) {
  if (request.cookies.get("userEmail")) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.cookies.set("userEmail", DEFAULT_ADMIN_EMAIL, { path: "/" });
  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
