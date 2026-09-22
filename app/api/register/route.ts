import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, normalizeEmail } from "@/lib/auth";

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
}).refine((value) => value.password === value.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

export async function POST(request: Request) {
  const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid registration details" }, { status: 400 });
  try {
    return await auth.api.signUpEmail({
      headers: request.headers,
      body: { name: parsed.data.name, email: normalizeEmail(parsed.data.email), password: parsed.data.password, callbackURL: "/" },
      asResponse: true,
    });
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 400;
    return NextResponse.json({ error: status === 403 ? "A valid invitation is required to sign up." : "Unable to create this account." }, { status });
  }
}
