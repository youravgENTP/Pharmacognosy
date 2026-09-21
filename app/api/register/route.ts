import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, isAuthEmailConfigured, isDevelopmentEmailBypass, normalizeEmail } from "@/lib/auth";

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
}).refine((value) => value.password === value.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

export async function POST(request: Request) {
  if (!isDevelopmentEmailBypass() && !isAuthEmailConfigured()) return NextResponse.json({ error: "Email verification is not configured yet. Add the Resend settings before creating an account." }, { status: 503 });
  const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid registration details" }, { status: 400 });
  try {
    const response = await auth.api.signUpEmail({
      headers: request.headers,
      body: { name: parsed.data.name, email: normalizeEmail(parsed.data.email), password: parsed.data.password, callbackURL: "/" },
      asResponse: true,
    });
    if (!response.ok || !isDevelopmentEmailBypass()) return response;
    const data = await response.json();
    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json");
    return new NextResponse(JSON.stringify({ ...data, emailVerificationRequired: false }), { status: response.status, headers });
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 400;
    return NextResponse.json({ error: status === 403 ? "A valid invitation is required to sign up." : status === 503 ? "Email verification is not configured yet." : "Unable to create this account." }, { status });
  }
}
