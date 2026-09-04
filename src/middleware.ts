import { NextResponse, type NextRequest } from "next/server";

// No real auth in this skeleton: whoever shows up with no userEmail cookie
// yet is treated as the first user and signed in as admin automatically.
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
