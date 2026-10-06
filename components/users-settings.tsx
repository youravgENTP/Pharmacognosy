"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import type { UserRole } from "@/lib/db/schema";

type MnemonicProgress = {
  assignmentLabel: string; assigned: number; required: number; completed: number; remaining: number; excluded: number; percent: number;
  incomplete: { id: string; name: string }[]; missingCards: string[];
};
type ListedUser = { id: string; name: string; email: string; role: UserRole; createdAt: string; progress: MnemonicProgress | null };
type Invitation = { id: string; email: string; createdAt: string; expiresAt: string; acceptedAt: string | null };

export function UsersSettings({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<ListedUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [passwords, setPasswords] = useState({ password: "", confirm: "" });
  const [resetPending, setResetPending] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetStatus, setResetStatus] = useState("");

  async function load() {
    const [usersResponse, invitationsResponse] = await Promise.all([fetch("/api/admin/users"), fetch("/api/admin/invitations")]);
    if (usersResponse.ok) setUsers(await usersResponse.json());
    if (invitationsResponse.ok) setInvitations(await invitationsResponse.json());
  }
  useEffect(() => { void load(); }, []);

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError("");
    const response = await fetch("/api/admin/invitations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    const body = await response.json();
    setPending(false);
    if (!response.ok) return setError(body.error ?? "Could not create invitation");
    setEmail(""); await load();
  }

  async function changeRole(userId: string, role: UserRole) {
    setError("");
    const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, role }) });
    const body = await response.json();
    if (!response.ok) return setError(body.error ?? "Could not update role");
    setUsers((all) => all.map((item) => item.id === userId ? { ...item, role } : item));
  }

  function openReset(userId: string) {
    setResetUserId(userId); setPasswords({ password: "", confirm: "" }); setResetError(""); setResetStatus("");
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault(); setResetError(""); setResetStatus("");
    if (!resetUserId) return;
    if (passwords.password.length < 8) return setResetError("Password must be at least 8 characters.");
    if (passwords.password !== passwords.confirm) return setResetError("Passwords do not match.");
    if (resetPending) return;
    setResetPending(true);
    const response = await fetch("/api/admin/users/reset-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: resetUserId, newPassword: passwords.password }) });
    const body = await response.json().catch(() => ({}));
    setResetPending(false);
    if (!response.ok) return setResetError(body.error ?? "Could not reset password");
    setPasswords({ password: "", confirm: "" }); setResetStatus("Password reset. All of this user's sessions were revoked.");
  }

  return <div className="settings-stack">
    <section className="panel"><h2>Invite user</h2><p className="muted">Invitations are valid for 7 days and can be used once.</p><form className="invite-form" onSubmit={invite}><label className="field"><span>Email</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)}/></label><button className="button" disabled={pending}>{pending ? "Inviting…" : "Create invitation"}</button></form>{error && <p className="form-error">{error}</p>}</section>
    <section className="panel"><h2>Existing users</h2><p className="muted user-progress-intro">담당 생약 중 암기법 Field가 있는 카드만 완료 대상에 포함됩니다.</p><div className="user-list">{users.map((item) => <div className="user-entry" key={item.id}>
      <div className="user-row"><div><strong>{item.name}</strong><span>{item.email}</span></div><div className="user-actions"><select aria-label={`Role for ${item.name}`} value={item.role} disabled={item.id === currentUserId} onChange={(event) => changeRole(item.id, event.target.value as UserRole)}><option value="editor">Editor</option><option value="admin">Admin</option></select><button type="button" className="button secondary" onClick={() => openReset(item.id)}>Reset password</button></div></div>
      {item.progress ? <MnemonicProgressCard progress={item.progress}/> : null}
      {resetUserId === item.id && <form className="password-reset-form" onSubmit={resetPassword}><label className="field"><span>New password</span><input type="password" minLength={8} autoComplete="new-password" required value={passwords.password} onChange={(event) => setPasswords({ ...passwords, password: event.target.value })}/></label><label className="field"><span>Confirm password</span><input type="password" minLength={8} autoComplete="new-password" required value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}/></label>{resetError && <p className="form-error">{resetError}</p>}{resetStatus && <p className="form-success">{resetStatus}</p>}<div className="user-actions"><button type="button" className="button secondary" onClick={() => setResetUserId(null)}>Cancel</button><button className="button" disabled={resetPending}>{resetPending ? "Resetting…" : "Reset password"}</button></div></form>}
    </div>)}</div></section>
    <section className="panel"><h2>Invitations</h2><div className="user-list">{invitations.length ? invitations.map((item) => <div className="user-row" key={item.id}><div><strong>{item.email}</strong><span>{item.acceptedAt ? "Accepted" : new Date(item.expiresAt) < new Date() ? "Expired" : `Expires ${new Date(item.expiresAt).toLocaleDateString()}`}</span></div></div>) : <p className="muted">No invitations yet.</p>}</div></section>
  </div>;
}

function MnemonicProgressCard({ progress }: { progress: MnemonicProgress }) {
  return <div className="mnemonic-progress-card">
    <div className="mnemonic-progress-heading"><strong>{progress.assignmentLabel} 담당 · 암기법 {progress.completed}/{progress.required}</strong><span>{progress.percent}%</span></div>
    <div className="mnemonic-progress-track" aria-label={`${progress.assignmentLabel} 암기법 완료율 ${progress.percent}%`}><span style={{ width: `${progress.percent}%` }}/></div>
    <div className="mnemonic-progress-meta"><span>{progress.remaining ? `${progress.remaining}개 남음` : "완료"}</span><span>필드 없음 {progress.excluded}개</span><span>전체 배정 {progress.assigned}개</span></div>
    {progress.incomplete.length || progress.missingCards.length ? <details className="mnemonic-progress-details"><summary>상세 보기</summary>{progress.incomplete.length ? <div><b>미완료</b><span>{progress.incomplete.map((drug) => <Link href={`/drugs/${drug.id}`} scroll={false} key={drug.id}>{drug.name}</Link>)}</span></div> : null}{progress.missingCards.length ? <div className="missing"><b>카드 없음</b><span>{progress.missingCards.join(", ")}</span></div> : null}</details> : null}
  </div>;
}
