import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { decks, wordCards } from "@/lib/db/schema";

export async function GET() {
  const deckRows = await db.select().from(decks).orderBy(asc(decks.createdAt));
  const cards = await db.select().from(wordCards).orderBy(asc(wordCards.createdAt));
  return NextResponse.json(deckRows.map((deck) => ({ ...deck, cards: cards.filter((card) => card.deckId === deck.id) })));
}

export async function POST(request: Request) {
  const parsed = z.object({ name: z.string().trim().min(1).max(100) }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [row] = await db.insert(decks).values(parsed.data).returning();
  return NextResponse.json(row, { status: 201 });
}
