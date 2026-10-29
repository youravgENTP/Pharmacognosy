import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";

test("autosave and Cmd+S never invoke a file download", async () => {
  const editor = await readFile(new URL("../components/drug-editor.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(editor, /manual-save-backup/);
  assert.doesNotMatch(editor, /downloadBackup\(/);
  assert.doesNotMatch(editor, /createObjectURL/);
  assert.match(editor, /event\.preventDefault\(\)/);
  assert.match(editor, /persist\(draftRef\.current, expectedRevision, true\)/);
  await assert.rejects(access(new URL("../app/api/drugs/[id]/manual-save-backup/route.ts", import.meta.url)));
});

test("manual save verifies the stored revision and leaves the Data Card open", async () => {
  const editor = await readFile(new URL("../components/drug-editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /revisions\?baseRevision=\$\{body\.dataRevision\}/);
  assert.match(editor, /sameDataCard\(snapshot, verified\.remote\)/);
  const manualSave = editor.slice(editor.indexOf("async function manualSave"), editor.indexOf("async function openExport"));
  assert.doesNotMatch(manualSave, /requestClose|router\.(back|push)|download/);
});

test("close progress is a centered portal with real save states and recovery actions", async () => {
  const [guard, modal, profile, css] = await Promise.all([
    readFile(new URL("../components/data-card-save-guard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/data-card-close-progress-modal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/profile-modal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(guard, /DataCardCloseProgressModal/);
  assert.match(guard, /if \(closing\.current\) return closing\.current/);
  assert.match(guard, /resumePendingClose/);
  assert.match(modal, /변경사항 저장 중/); assert.match(modal, /저장 확인 중/); assert.match(modal, /안전하게 닫는 중/);
  assert.match(modal, /다시 시도/); assert.match(modal, /편집으로 돌아가기/); assert.match(modal, /충돌 해결/);
  assert.match(modal, /createPortal/); assert.match(modal, /event\.key === "Escape"/);
  assert.doesNotMatch(profile, /data-card-close-state/);
  assert.match(css, /\.data-card-progress-backdrop[^}]*place-items: center/);
  assert.match(css, /data-theme="night"[^\n]*\.data-card-progress-modal/);
});

test("conflict resolution replaces progress UI and resumes the original close only after verified merge", async () => {
  const editor = await readFile(new URL("../components/drug-editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /openConflictResolver: \(\) => setMergeVisible\(true\)/);
  assert.match(editor, /setMergeVisible\(!isClosePending\(\)\)/);
  assert.match(editor, /if \(closePending\) void resumePendingClose\(\)/);
  assert.match(editor, /if \(closePending\) cancelPendingClose\(\)/);
});

test("explicit Settings backup download remains intact", async () => {
  const [settings, client] = await Promise.all([
    readFile(new URL("../components/backup-settings.tsx", import.meta.url), "utf8"),
    readFile(new URL("./backup/client.ts", import.meta.url), "utf8"),
  ]);
  assert.match(settings, /downloadFullBackup/);
  assert.match(client, /\/api\/backup\/full/);
  assert.match(client, /anchor\.download|link\.download/);
});
