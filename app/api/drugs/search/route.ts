import { authorizeApi } from "@/lib/auth/permissions";
import { and, asc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { archiveEntries, archiveGroups, crudeDrugs } from "@/lib/db/schema";

export async function GET(request: Request) { const authError = await authorizeApi("user"); if (authError) return authError;
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
  const search = query ? or(ilike(crudeDrugs.koreanName, `%${query}%`), ilike(crudeDrugs.latinName, `%${query}%`), sql`CAST(${crudeDrugs.catalogIndex} AS TEXT) ILIKE ${`%${query}%`}`, sql`CAST(${crudeDrugs.referenceIndex} AS TEXT) ILIKE ${`%${query}%`}`, sql`(${archiveGroups.prefix} || CASE WHEN ${archiveEntries.originalIndexType} = 'reference' THEN 'R' ELSE '' END || LPAD(CAST(${archiveEntries.originalIndex} AS TEXT), 2, '0')) ILIKE ${`%${query}%`}`) : undefined;
  const rows = await db.select({ id: crudeDrugs.id, koreanName: crudeDrugs.koreanName, latinName: crudeDrugs.latinName, catalogIndex: crudeDrugs.catalogIndex, referenceIndex: crudeDrugs.referenceIndex, archivePrefix: archiveGroups.prefix, archiveName: archiveGroups.name, archiveOriginalIndexType: archiveEntries.originalIndexType, archiveOriginalIndex: archiveEntries.originalIndex }).from(crudeDrugs).leftJoin(archiveEntries, eq(archiveEntries.drugId, crudeDrugs.id)).leftJoin(archiveGroups, eq(archiveGroups.id, archiveEntries.archiveGroupId)).where(and(includeArchived ? undefined : isNull(archiveEntries.id), search)).orderBy(asc(crudeDrugs.koreanName)).limit(30);
  return NextResponse.json(rows.map((row) => ({ ...row, archive: row.archivePrefix && row.archiveOriginalIndex != null ? { prefix: row.archivePrefix, name: row.archiveName, originalIndexType: row.archiveOriginalIndexType ?? "catalog", originalIndex: row.archiveOriginalIndex } : null })));
}
