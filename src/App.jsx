import React, { useEffect, useState, useCallback, useMemo } from "react";
import "./styles.css";

// Flashcards v2
// - Desteklenen türler: "mcq" (çoktan seçmeli), "tf" (True/False), "open" (açık uçlu)
// - mcq: choices[] + answerIndex
// - tf: answer: true | false
// - open: a: string (kart tıklayınca veya "Cevabı Göster" ile görünür)
// - Klavye: ←/→ gezinme; 1-9 şık seçimi; T/F tuşları tf için; Space open için flip

export default function FlashcardApp() {
  const [cards, setCards] = useState([]);
  const [originalCards, setOriginalCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);

  // kullanıcı seçimleri: mcq -> number | null, tf -> boolean | null, open -> boolean (revealed)
  const [answers, setAnswers] = useState([]);
  const [revealAll, setRevealAll] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/questions.json");
        if (!r.ok) throw new Error("Sorular yüklenemedi");
        const data = await r.json();
        const normalized = normalizeCards(Array.isArray(data?.cards) ? data.cards : []);
        if (alive) {
          setCards(normalized);
          setOriginalCards(normalized);
          setAnswers(normalized.map(() => null));
          setIndex(0);
        }
      } catch (e) {
        console.error(e);
        if (alive) {
          setCards([]);
          setOriginalCards([]);
          setAnswers([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const total = cards.length;
  const current = cards[index];

  const next = useCallback(() => {
    if (total === 0) return;
    setIndex((i) => (i + 1) % total);
  }, [total]);

  const prev = useCallback(() => {
    if (total === 0) return;
    setIndex((i) => (i - 1 + total) % total);
  }, [total]);

  const setAnswer = useCallback((value) => {
    setAnswers((prev) => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  }, [index]);

  const resetAll = () => {
    setCards(originalCards);
    setAnswers(originalCards.map(() => null));
    setIndex(0);
    setRevealAll(false);
  };

  // UI yardımcıları
  const type = current?.type ?? inferType(current);
  const userAns = answers[index];
  const isCorrect = useMemo(() => {
    if (!current) return null;
    if (type === "mcq") return userAns === current.answerIndex;
    if (type === "tf") return typeof userAns === "boolean" ? userAns === !!current.answer : null;
    // open: doğruluk kontrolü yok (bilgi kartı)
    return null;
  }, [current, type, userAns]);

  // Klavye: ← →; 1-9 (mcq); T/F (tf); Space (open reveal)
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (current) {
        const t = type;
        if (t === "mcq" && /^[1-9]$/.test(e.key)) {
          const idx = parseInt(e.key, 10) - 1;
          if (idx >= 0 && idx < current.choices.length) { e.preventDefault(); setAnswer(idx); }
        } else if (t === "tf") {
          if (e.key.toLowerCase() === "t") { e.preventDefault(); setAnswer(true); }
          else if (e.key.toLowerCase() === "f") { e.preventDefault(); setAnswer(false); }
        } else if (t === "open") {
          if (e.key === " ") { e.preventDefault(); setAnswer((v) => !(v === true)); }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, type, next, prev, setAnswer]);

  if (loading) return <Skeleton text="Yükleniyor…"/>;
  if (total === 0) return <Empty/>;

  return (
    <div className="page">
      <div className="app">
        <header className="header">
          <h1>Greek Flashcards</h1>
          <span className="progress">{index + 1} / {total}</span>
        </header>

        <div className="toolbar">
          <button className="btn" onClick={() => setRevealAll((v) => !v)}>
            {revealAll ? "Cevapları Gizle" : "Cevapları Göster"}
          </button>
          <button className="btn" onClick={() => setAnswer(null)}>Bu kartı temizle</button>
          <button className="btn" onClick={resetAll}>Hepsini sıfırla</button>
        </div>

        {/* KART */}
        <div className="card">
          <div className="label">Soru</div>
          <div className="question">{current.q}</div>

          <div className="divider" />

          {type === "mcq" && (
            <MultipleChoice
              choices={current.choices}
              answerIndex={current.answerIndex}
              picked={typeof userAns === "number" ? userAns : null}
              reveal={revealAll}
              onPick={(i) => setAnswer(i)}
            />
          )}

          {type === "tf" && (
            <TrueFalse
              correct={!!current.answer}
              picked={typeof userAns === "boolean" ? userAns : null}
              reveal={revealAll}
              onPick={(val) => setAnswer(val)}
            />
          )}

          {type === "open" && (
            <OpenCard
              answer={String(current.a ?? "")}
              revealed={revealAll || userAns === true}
              onToggle={() => setAnswer((v) => !(v === true))}
            />
          )}
        </div>

        <div className="controls">
          <button onClick={prev} className="btn" aria-label="Önceki">← Geri</button>
          <button onClick={next} className="btn" aria-label="Sonraki">İleri →</button>
        </div>

        {/* Sonuç etiketi (yalnız mcq/tf için) */}
        {isCorrect !== null && type !== "open" && (
          <p className="hint" aria-live="polite">
            {answers[index] === null ? "Bir seçim yapın." : (isCorrect ? "Doğru!" : "Yanlış.")}
          </p>
        )}

     <p className="hint">← / → ile gezin </p>
      </div>
    </div>
  );
}

// === Bileşenler ===
function MultipleChoice({ choices, answerIndex, picked, reveal, onPick }) {
  return (
    <div>
      <div className="label">Şıklar</div>
      <ul className="choices">
        {choices.map((ch, i) => {
          const isCorrect = i === answerIndex;
          const isPicked = picked === i;
          const showReveal = reveal && isCorrect && picked !== null && !isPicked;
          const cls = [
            "choice",
            isPicked ? (isCorrect ? "choice-correct" : "choice-wrong") : "",
            !isPicked && showReveal ? "choice-reveal" : "",
          ].join(" ").trim();
          return (
            <li key={i}>
              <button type="button" className={cls} onClick={() => onPick(i)} aria-pressed={isPicked}>
                <span className="choice-index">{i + 1}.</span>
                <span className="choice-text">{ch}</span>
                {isPicked && isCorrect && <span className="badge ok">Doğru</span>}
                {isPicked && !isCorrect && <span className="badge no">Yanlış</span>}
                {!isPicked && showReveal && <span className="badge ok ghost">Doğru cevap</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TrueFalse({ correct, picked, reveal, onPick }) {
  // Radio seçenek görünümünde
  const options = [
    { label: "True", value: true },
    { label: "False", value: false },
  ];
  return (
    <div>
      <div className="label">Σ/Λ (Doğru/Yanlış)</div>
      <div className="tf-group" role="radiogroup" aria-label="True/False">
        {options.map((opt) => {
          const isPicked = picked === opt.value;
          const isCorrect = opt.value === correct;
          const showReveal = reveal && isCorrect && picked !== null && !isPicked;
          const cls = [
            "tf-option",
            isPicked ? (isCorrect ? "choice-correct" : "choice-wrong") : "",
            !isPicked && showReveal ? "choice-reveal" : "",
          ].join(" ").trim();
          return (
            <label key={String(opt.value)} className={cls}>
              <input
                type="radio"
                name="tf"
                checked={isPicked}
                onChange={() => onPick(opt.value)}
              />
              <span>{opt.label}</span>
              {isPicked && isCorrect && <span className="badge ok">Doğru</span>}
              {isPicked && !isCorrect && <span className="badge no">Yanlış</span>}
              {!isPicked && showReveal && <span className="badge ok ghost">Doğru cevap</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function OpenCard({ answer, revealed, onToggle }) {
  return (
    <div>
      <div className="label">Cevap</div>
      <button type="button" className="open-card" onClick={onToggle} aria-expanded={revealed}>
        <span className="pill">{revealed ? "Görünüyor" : "Gizli (Tıkla / Space)"}</span>
        <div className={"open-answer " + (revealed ? "show" : "hide")}>{revealed ? answer : "••••••••"}</div>
      </button>
    </div>
  );
}

function Skeleton({ text }) {
  return (
    <div className="page"><div className="app">{text}</div></div>
  );
}
function Empty() {
  return (
    <div className="page"><div className="app">Kart yok. <code>public/questions.json</code> ekleyin.</div></div>
  );
}

// === Yardımcılar ===
function inferType(card) {
  if (!card) return "open";
  if (Array.isArray(card.choices) && Number.isInteger(card.answerIndex)) return "mcq";
  if (typeof card.answer === "boolean") return "tf";
  if (typeof card.a === "string") return "open";
  return "open";
}

function normalizeCards(cards) {
  return cards.map((c) => {
    const t = c.type || inferType(c);
    if (t === "mcq") {
      return { type: "mcq", q: c.q ?? "—", choices: c.choices ?? [], answerIndex: Number(c.answerIndex ?? 0) };
    } else if (t === "tf") {
      return { type: "tf", q: c.q ?? "—", answer: !!c.answer };
    } else {
      return { type: "open", q: c.q ?? "—", a: String(c.a ?? "") };
    }
  });
}
