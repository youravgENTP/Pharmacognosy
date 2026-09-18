"use client";

import { Eye, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

type Card = { id: string; front: string; back: string; crudeDrugId: string | null; collectionId: string | null };
type Deck = { id: string; name: string; cards: Card[] };
type LinkOption = { id: string; name: string };

export function CardsManager({ drugs, collections }: { drugs: LinkOption[]; collections: LinkOption[] }) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deckName, setDeckName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { front: string; back: string; crudeDrugId?: string; collectionId?: string }>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  async function load() { const response = await fetch("/api/decks"); setDecks(await response.json()); }
  useEffect(() => { void load(); }, []);
  async function addDeck(event: React.FormEvent) { event.preventDefault(); if (!deckName.trim()) return; await fetch("/api/decks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: deckName }) }); setDeckName(""); await load(); }
  async function addCard(event: React.FormEvent, deckId: string) { event.preventDefault(); const draft = drafts[deckId]; if (!draft?.front.trim() || !draft.back.trim()) return; await fetch(`/api/decks/${deckId}/cards`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, crudeDrugId: draft.crudeDrugId || null, collectionId: draft.collectionId || null }) }); setDrafts((current) => ({ ...current, [deckId]: { front: "", back: "" } })); await load(); }
  async function removeCard(id: string) { await fetch(`/api/cards/${id}`, { method: "DELETE" }); await load(); }
  async function removeDeck(id: string) { if (!window.confirm("덱과 포함된 카드를 삭제할까요?")) return; await fetch(`/api/decks/${id}`, { method: "DELETE" }); await load(); }
  return <>
    <form className="form-row panel" onSubmit={addDeck} style={{ marginBottom: 20 }}><input className="plain-input" value={deckName} onChange={(event) => setDeckName(event.target.value)} placeholder="새 덱 이름"/><button className="button"><Plus size={15}/> 덱 만들기</button></form>
    {decks.length ? <div className="deck-grid">{decks.map((deck) => { const draft = drafts[deck.id] ?? { front: "", back: "", crudeDrugId: "", collectionId: "" }; return <article className="panel" key={deck.id}>
      <div className="collection-title"><h2 style={{ margin: 0, fontSize: 20 }}>{deck.name}</h2><button className="icon-button" onClick={() => removeDeck(deck.id)}><Trash2 size={16}/></button></div>
      <div className="card-list">{deck.cards.map((card) => <div className="word-card" key={card.id}><div className="collection-title"><strong>{card.front}</strong><div><button className="icon-button" title="정답 보기" onClick={() => setRevealed((current) => ({ ...current, [card.id]: !current[card.id] }))}><Eye size={16}/></button><button className="icon-button" onClick={() => removeCard(card.id)}><Trash2 size={15}/></button></div></div>{(card.crudeDrugId || card.collectionId) ? <small className="muted">{card.crudeDrugId ? `생약 · ${drugs.find((drug) => drug.id === card.crudeDrugId)?.name ?? "연결됨"}` : `Collection · ${collections.find((collection) => collection.id === card.collectionId)?.name ?? "연결됨"}`}</small> : null}{revealed[card.id] ? <div className="back">{card.back}</div> : null}</div>)}</div>
      <form onSubmit={(event) => addCard(event, deck.id)} style={{ marginTop: 16, display: "grid", gap: 8 }}><input className="plain-input" placeholder="앞면" value={draft.front} onChange={(event) => setDrafts((current) => ({ ...current, [deck.id]: { ...draft, front: event.target.value } }))}/><textarea className="plain-input" placeholder="뒷면" value={draft.back} onChange={(event) => setDrafts((current) => ({ ...current, [deck.id]: { ...draft, back: event.target.value } }))}/><div className="form-row"><select className="plain-input" value={draft.crudeDrugId ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [deck.id]: { ...draft, crudeDrugId: event.target.value, collectionId: "" } }))}><option value="">생약 연결 (선택)</option>{drugs.map((drug) => <option value={drug.id} key={drug.id}>{drug.name}</option>)}</select><select className="plain-input" value={draft.collectionId ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [deck.id]: { ...draft, collectionId: event.target.value, crudeDrugId: "" } }))}><option value="">Collection 연결 (선택)</option>{collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}</select></div><button className="button secondary">카드 추가</button></form>
    </article>; })}</div> : <div className="empty">덱을 만들고 수동으로 학습 카드를 작성하세요.</div>}
  </>;
}
