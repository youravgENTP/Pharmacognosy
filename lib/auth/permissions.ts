import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function authorizeApi(level: "user" | "editor" | "admin" = "user") {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (level === "admin" && current.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  if (level === "editor" && current.role !== "editor" && current.role !== "admin") return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  return null;
}
