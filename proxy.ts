import { NextResponse, type NextRequest } from "next/server";

import { assignVariant } from "@/lib/ab";
import { copy } from "@/lib/copy";
import { LOCALE_COOKIE, parseLocale } from "@/lib/locale";

function timingSafeEqual(a: string, b: string) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length === right.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

function adminOk(request: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;
  const decoded = atob(header.slice(6));
  const split = decoded.indexOf(":");
  if (split < 0) return false;
  return decoded.slice(0, split) === "admin" && timingSafeEqual(decoded.slice(split + 1), expected);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const locale = parseLocale(request.cookies.get(LOCALE_COOKIE)?.value);
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/v1/admin")) {
    if (!adminOk(request)) {
      return new NextResponse(copy(locale).admin.signIn, {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Werkplan"',
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pc-lang", locale);
  const existingAnon = request.cookies.get("pc_anon")?.value;
  const anon = existingAnon ?? crypto.randomUUID();
  requestHeaders.set("x-pc-anon", anon);

  let variant = request.cookies.get("pc_exp3")?.value;
  const onAdvisor = pathname === "/beratung";
  if (onAdvisor && variant !== "control" && variant !== "chat") {
    variant = await assignVariant(anon);
  }
  if (variant === "control" || variant === "chat") {
    requestHeaders.set("x-pc-variant", variant);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (!existingAnon) {
    response.cookies.set("pc_anon", anon, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === "production",
    });
  }
  if (onAdvisor && request.cookies.get("pc_exp3")?.value !== variant && (variant === "control" || variant === "chat")) {
    response.cookies.set("pc_exp3", variant, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
