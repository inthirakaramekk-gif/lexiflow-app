"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { VOCAB } from "./vocab";
import { Word, UserProgress } from "./types";
import { CardData, generateFallbackCard } from "./utils/fallbackGenerator";

export default function Home() {
  // Tab state: 'dashboard' | 'flashcards' | 'quiz' | 'explorer'
  const [activeTab, setActiveTab] = useState<"dashboard" | "flashcards" | "quiz" | "explorer">("dashboard");

  // Global Progress State
  const [progress, setProgress] = useState<UserProgress>({
    masteredIds: [],
    starredIds: [],
    notes: {},
  });

  // Database cache of generated sentence data
  const [cardCache, setCardCache] = useState<Record<string, CardData>>({});

  // Active card data for flashcards
  const [activeCardData, setActiveCardData] = useState<CardData | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Load progress and card cache from localStorage (with server DB as fallback/initial seed)
  useEffect(() => {
    try {
      const savedProgress = localStorage.getItem("lexiflow_progress");
      const savedCache = localStorage.getItem("lexiflow_card_cache");

      if (savedProgress || savedCache) {
        if (savedProgress) {
          const parsed = JSON.parse(savedProgress);
          setProgress({
            masteredIds: parsed.masteredIds || [],
            starredIds: parsed.starredIds || [],
            notes: parsed.notes || {},
          });
        }
        if (savedCache) {
          setCardCache(JSON.parse(savedCache));
        }
      } else {
        // First-time load: Seed initial database from server-side db.json
        fetch("/api/db")
          .then((res) => {
            if (!res.ok) throw new Error("Failed to load initial backend database");
            return res.json();
          })
          .then((data) => {
            if (data.progress) {
              const initialProgress = {
                masteredIds: data.progress.masteredIds || [],
                starredIds: data.progress.starredIds || [],
                notes: data.progress.notes || {},
              };
              setProgress(initialProgress);
              localStorage.setItem("lexiflow_progress", JSON.stringify(initialProgress));
            }
            if (data.cardCache) {
              setCardCache(data.cardCache);
              localStorage.setItem("lexiflow_card_cache", JSON.stringify(data.cardCache));
            }
          })
          .catch((err) => {
            console.warn("Failed to fetch initial seed data from server DB", err);
          });
      }
    } catch (e) {
      console.error("Failed to load initial state", e);
    }
  }, []);

  // Save progress to localStorage (pure client side)
  const saveProgress = (newProgress: UserProgress) => {
    setProgress(newProgress);
    try {
      localStorage.setItem("lexiflow_progress", JSON.stringify(newProgress));
    } catch (e) {
      console.error("Failed to save progress to localStorage", e);
    }
  };

  // Save card cache to localStorage (pure client side)
  const saveCardCache = (newCache: Record<string, CardData>) => {
    setCardCache(newCache);
    try {
      localStorage.setItem("lexiflow_card_cache", JSON.stringify(newCache));
    } catch (e) {
      console.error("Failed to save card cache to localStorage", e);
    }
  };

  // Helper toggle functions
  const toggleMastered = (id: string) => {
    const isMastered = progress.masteredIds.includes(id);
    const newMastered = isMastered
      ? progress.masteredIds.filter((mid) => mid !== id)
      : [...progress.masteredIds, id];
    saveProgress({ ...progress, masteredIds: newMastered });
  };

  const toggleStarred = (id: string) => {
    const isStarred = progress.starredIds.includes(id);
    const newStarred = isStarred
      ? progress.starredIds.filter((sid) => sid !== id)
      : [...progress.starredIds, id];
    saveProgress({ ...progress, starredIds: newStarred });
  };

  const saveNote = (id: string, note: string) => {
    const newNotes = { ...progress.notes, [id]: note };
    saveProgress({ ...progress, notes: newNotes });
  };

  // Get total unique parts of speech
  const posList = useMemo(() => {
    const set = new Set<string>();
    VOCAB.forEach((w) => set.add(w.pos));
    return Array.from(set).sort();
  }, []);

  // ----------------------------------------------------
  // SEARCH & EXPLORER STATE
  // ----------------------------------------------------
  const [searchQuery, setSearchQuery] = useState("");
  const [explorerPosFilter, setExplorerPosFilter] = useState("all");
  const [explorerStatusFilter, setExplorerStatusFilter] = useState<"all" | "learning" | "mastered" | "starred">("all");
  const [explorerPage, setExplorerPage] = useState(1);
  const itemsPerPage = 60;

  const filteredWords = useMemo(() => {
    return VOCAB.filter((w) => {
      const matchesSearch = w.word.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPos = explorerPosFilter === "all" || w.pos === explorerPosFilter;
      
      let matchesStatus = true;
      if (explorerStatusFilter === "mastered") {
        matchesStatus = progress.masteredIds.includes(w.id);
      } else if (explorerStatusFilter === "starred") {
        matchesStatus = progress.starredIds.includes(w.id);
      } else if (explorerStatusFilter === "learning") {
        matchesStatus = !progress.masteredIds.includes(w.id);
      }

      return matchesSearch && matchesPos && matchesStatus;
    });
  }, [searchQuery, explorerPosFilter, explorerStatusFilter, progress]);

  // Reset page when filters change
  useEffect(() => {
    setExplorerPage(1);
  }, [searchQuery, explorerPosFilter, explorerStatusFilter]);

  const pagedWords = useMemo(() => {
    const end = explorerPage * itemsPerPage;
    return filteredWords.slice(0, end);
  }, [filteredWords, explorerPage]);

  // ----------------------------------------------------
  // FLASHCARDS STATE
  // ----------------------------------------------------
  const [flashcardDeckType, setFlashcardDeckType] = useState<"all" | "learning" | "starred">("all");
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [cardTransition, setCardTransition] = useState<"none" | "swipe-left" | "swipe-right">("none");

  const flashcardWords = useMemo(() => {
    if (flashcardDeckType === "starred") {
      return VOCAB.filter((w) => progress.starredIds.includes(w.id));
    }
    if (flashcardDeckType === "learning") {
      return VOCAB.filter((w) => !progress.masteredIds.includes(w.id));
    }
    return VOCAB;
  }, [flashcardDeckType, progress]);

  const currentWordObj = flashcardWords[currentCardIndex] || null;

  // Reset card index if deck changes
  useEffect(() => {
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setActiveCardData(null);
  }, [flashcardDeckType]);

  // Fetch or generate sentence structures when current card changes
  useEffect(() => {
    if (!currentWordObj) {
      setActiveCardData(null);
      setApiError(null);
      return;
    }

    // Check database cache first
    if (cardCache[currentWordObj.id]) {
      setActiveCardData(cardCache[currentWordObj.id]);
      setApiError(null);
      return;
    }

    // Not in cache, start loading and generate
    setLoadingAI(true);
    setApiError(null);
    setActiveCardData(null);

    // Call the serverless Gemini endpoint
    fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: currentWordObj.word, pos: currentWordObj.pos })
    })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        return data as CardData;
      })
      .then((data) => {
        // Save to cache database
        const newCache = { ...cardCache, [currentWordObj.id]: data };
        saveCardCache(newCache);
        setActiveCardData(data);
      })
      .catch((err) => {
        console.warn("API generate failed, loading client-side fallback sentences.", err);
        setApiError(err.message || "Unknown API Error");
        // Fallback generator
        const fallback = generateFallbackCard(currentWordObj);
        const newCache = { ...cardCache, [currentWordObj.id]: fallback };
        saveCardCache(newCache);
        setActiveCardData(fallback);
      })
      .finally(() => {
        setLoadingAI(false);
      });
  }, [currentWordObj, cardCache]);

  const regenerateCard = () => {
    if (!currentWordObj) return;

    setLoadingAI(true);
    setApiError(null);
    setIsFlipped(false);

    fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: currentWordObj.word, pos: currentWordObj.pos })
    })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        return data as CardData;
      })
      .then((data) => {
        // Save to cache database
        const newCache = { ...cardCache, [currentWordObj.id]: data };
        saveCardCache(newCache);
        setActiveCardData(data);
      })
      .catch((err) => {
        console.error("API regeneration failed", err);
        setApiError(err.message || "Failed to regenerate card");
      })
      .finally(() => {
        setLoadingAI(false);
      });
  };

  // Speak pronunciation
  const speakWord = (wordText: string) => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(wordText);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Keyboard controls for flashcards
  useEffect(() => {
    if (activeTab !== "flashcards") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return; // Ignore inside input fields
      }
      if (e.key === " ") {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (e.key === "ArrowRight") {
        handleCardNext("swipe-right");
      } else if (e.key === "ArrowLeft") {
        handleCardPrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, flashcardWords, currentCardIndex]);

  const handleCardNext = (direction: "swipe-left" | "swipe-right") => {
    if (flashcardWords.length === 0) return;
    setCardTransition(direction);
    setTimeout(() => {
      setIsFlipped(false);
      setCurrentCardIndex((prev) => (prev + 1) % flashcardWords.length);
      setCardTransition("none");
    }, 250);
  };

  const handleCardPrev = () => {
    if (flashcardWords.length === 0) return;
    setCardTransition("swipe-left");
    setTimeout(() => {
      setIsFlipped(false);
      setCurrentCardIndex((prev) => (prev - 1 + flashcardWords.length) % flashcardWords.length);
      setCardTransition("none");
    }, 250);
  };

  // ----------------------------------------------------
  // QUIZ STATE & LOGIC
  // ----------------------------------------------------
  const [quizMode, setQuizMode] = useState<"pos" | "spelling" | "missing">("pos");
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [quizTotalQuestions, setQuizTotalQuestions] = useState(0);
  const [currentQuizWord, setCurrentQuizWord] = useState<Word | null>(null);
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [spellingInput, setSpellingInput] = useState("");
  const [quizFeedback, setQuizFeedback] = useState<"none" | "correct" | "incorrect">("none");
  const [missingLettersHint, setMissingLettersHint] = useState("");

  const startNewQuizQuestion = () => {
    setSelectedAnswer(null);
    setSpellingInput("");
    setQuizFeedback("none");

    if (VOCAB.length === 0) return;

    const cachedIds = Object.keys(cardCache);
    let pool = VOCAB.filter((w) => cachedIds.includes(w.id));
    
    // Safety fallback
    if (pool.length === 0) {
      pool = VOCAB;
    }

    let unmastered = pool.filter((w) => !progress.masteredIds.includes(w.id));
    if (unmastered.length === 0) unmastered = pool;

    const randomWord = unmastered[Math.floor(Math.random() * unmastered.length)];
    setCurrentQuizWord(randomWord);

    if (quizMode === "pos") {
      const correct = randomWord.pos;
      const filteredPos = posList.filter((p) => p !== correct);
      const shuffledWrong = filteredPos.sort(() => 0.5 - Math.random()).slice(0, 3);
      const opts = [...shuffledWrong, correct].sort(() => 0.5 - Math.random());
      setQuizOptions(opts);
    } else if (quizMode === "missing") {
      const wordStr = randomWord.word;
      let hint = "";
      for (let i = 0; i < wordStr.length; i++) {
        if (i > 0 && i < wordStr.length - 1 && Math.random() > 0.5 && wordStr[i] !== " " && wordStr[i] !== "-") {
          hint += "_";
        } else {
          hint += wordStr[i];
        }
      }
      if (!hint.includes("_") && wordStr.length > 2) {
        const midIndex = Math.floor(wordStr.length / 2);
        hint = hint.substring(0, midIndex) + "_" + hint.substring(midIndex + 1);
      }
      setMissingLettersHint(hint);
    }
  };

  const startQuiz = (mode: "pos" | "spelling" | "missing") => {
    setQuizMode(mode);
    setQuizScore(0);
    setQuizTotalQuestions(0);
    setQuizStarted(true);
    setTimeout(() => startNewQuizQuestion(), 50);
  };

  const checkAnswer = (answer: string) => {
    if (!currentQuizWord || selectedAnswer !== null || quizFeedback !== "none") return;

    const isCorrect = answer.trim().toLowerCase() === currentQuizWord.word.trim().toLowerCase();
    setSelectedAnswer(answer);
    
    if (isCorrect) {
      setQuizFeedback("correct");
      setQuizScore((prev) => prev + 1);
    } else {
      setQuizFeedback("incorrect");
    }
    setQuizTotalQuestions((prev) => prev + 1);
  };

  const checkPosAnswer = (answerPos: string) => {
    if (!currentQuizWord || selectedAnswer !== null || quizFeedback !== "none") return;

    const isCorrect = answerPos === currentQuizWord.pos;
    setSelectedAnswer(answerPos);

    if (isCorrect) {
      setQuizFeedback("correct");
      setQuizScore((prev) => prev + 1);
    } else {
      setQuizFeedback("incorrect");
    }
    setQuizTotalQuestions((prev) => prev + 1);
  };

  const scrambledWord = useMemo(() => {
    if (!currentQuizWord) return "";
    const letters = currentQuizWord.word.replace(/\s+/g, "").split("");
    return letters.sort(() => 0.5 - Math.random()).join(" ");
  }, [currentQuizWord]);

  const getPosBadgeColor = (pos: string) => {
    switch (pos) {
      case "n.":
        return "bg-blue-500/10 text-blue-400 border border-blue-500/30";
      case "v.":
        return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30";
      case "adj.":
        return "bg-violet-500/10 text-violet-400 border border-violet-500/30";
      case "adv.":
        return "bg-amber-500/10 text-amber-400 border border-amber-500/30";
      case "prep.":
        return "bg-rose-500/10 text-rose-400 border border-rose-500/30";
      case "conj.":
        return "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30";
      case "pron.":
        return "bg-pink-500/10 text-pink-400 border border-pink-500/30";
      default:
        return "bg-zinc-800 text-zinc-400 border border-zinc-700";
    }
  };

  const masteredPercentage = useMemo(() => {
    return Math.round((progress.masteredIds.length / VOCAB.length) * 100) || 0;
  }, [progress.masteredIds]);

  return (
    <div className="flex flex-1 min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Dynamic CSS animations */}
      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        @keyframes glowPop {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
          50% { transform: scale(1.02); box-shadow: 0 0 20px 10px rgba(16, 185, 129, 0.2); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        .animate-shake {
          animation: shake 0.3s ease-in-out;
        }
        .animate-correct {
          animation: glowPop 0.4s ease-in-out;
        }
        .card-perspective {
          perspective: 1500px;
        }
        .card-inner {
          transition: transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          transform-style: preserve-3d;
        }
        .card-flipped {
          transform: rotateY(180deg);
        }
        .card-face {
          backface-visibility: hidden;
        }
        .card-back {
          transform: rotateY(180deg);
        }
        .swipe-left {
          transform: translateX(-200px) rotate(-15deg);
          opacity: 0;
          transition: all 0.3s ease-in;
        }
        .swipe-right {
          transform: translateX(200px) rotate(15deg);
          opacity: 0;
          transition: all 0.3s ease-in;
        }
      `}</style>

      {/* Side Bar Navigation */}
      <aside className="w-80 bg-zinc-900/60 backdrop-blur-xl border-r border-zinc-800/80 p-6 flex flex-col justify-between hidden md:flex">
        <div className="flex flex-col gap-8">
          <div className="flex items-center gap-3 pl-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">LexiFlow</h1>
              <p className="text-xs text-zinc-500 font-medium">Structure & Grammar</p>
            </div>
          </div>

          <nav className="flex flex-col gap-2">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 group ${
                activeTab === "dashboard"
                  ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_-3px_rgba(99,102,241,0.2)]"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent"
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
              </svg>
              Dashboard
            </button>

            <button
              onClick={() => setActiveTab("flashcards")}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 group ${
                activeTab === "flashcards"
                  ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_-3px_rgba(99,102,241,0.2)]"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent"
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Grammar Cards
            </button>

            <button
              onClick={() => setActiveTab("quiz")}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 group ${
                activeTab === "quiz"
                  ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_-3px_rgba(99,102,241,0.2)]"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent"
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Quiz Arena
            </button>

            <button
              onClick={() => setActiveTab("explorer")}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 group ${
                activeTab === "explorer"
                  ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_-3px_rgba(99,102,241,0.2)]"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent"
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l3-3m-3 3L9 8m-5 5h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293h3.172a1 1 0 00.707-.293l2.414-2.414a1 1 0 01.707-.293H20" />
              </svg>
              Word Explorer
            </button>
          </nav>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold">
            <span>Overall Mastery</span>
            <span className="text-indigo-400">{masteredPercentage}%</span>
          </div>
          <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${masteredPercentage}%` }}
            />
          </div>
          <p className="text-[11px] text-zinc-500 text-center">
            {progress.masteredIds.length} of {VOCAB.length} words mastered
          </p>
        </div>
      </aside>

      {/* Main Panel */}
      <main className="flex-1 flex flex-col overflow-y-auto bg-zinc-950 p-3 sm:p-6 md:p-8">
        {/* Mobile Header / Nav */}
        <header className="flex md:hidden items-center justify-between bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-white">LexiFlow</h1>
          </div>
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as any)}
            className="bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm font-semibold rounded-lg px-3 py-1.5 focus:outline-none"
          >
            <option value="dashboard">Dashboard</option>
            <option value="flashcards">Grammar Cards</option>
            <option value="quiz">Quiz Arena</option>
            <option value="explorer">Word Explorer</option>
          </select>
        </header>

        {/* ------------------------------------------------------------------------
            TAB 1: STATS DASHBOARD
        ------------------------------------------------------------------------ */}
        {activeTab === "dashboard" && (
          <section className="flex flex-col gap-8 max-w-5xl mx-auto w-full">
            <div className="relative overflow-hidden bg-gradient-to-r from-indigo-950/80 to-violet-950/50 border border-indigo-500/20 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
              <div className="absolute right-0 top-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl -z-10" />
              <div className="flex flex-col gap-2 text-center md:text-left">
                <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  Welcome to LexiFlow
                </h2>
                <p className="text-sm md:text-base text-zinc-300 max-w-lg leading-relaxed">
                  Learn grammar dynamically. Every card is now backed by a persistent database cache generating 5 distinct sentence structures and memory tricks.
                </p>
              </div>
              <div className="flex flex-col items-center justify-center bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl px-6 py-4 text-center">
                <span className="text-4xl font-extrabold text-indigo-400">{masteredPercentage}%</span>
                <span className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider mt-1">Mastery Progress</span>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 flex flex-col gap-2">
                <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Total Words</span>
                <span className="text-3xl font-extrabold text-white">{VOCAB.length}</span>
              </div>
              <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 flex flex-col gap-2">
                <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Words Mastered</span>
                <span className="text-3xl font-extrabold text-emerald-400">{progress.masteredIds.length}</span>
              </div>
              <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 flex flex-col gap-2">
                <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Starred Items</span>
                <span className="text-3xl font-extrabold text-amber-400">{progress.starredIds.length}</span>
              </div>
              <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 flex flex-col gap-2">
                <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Cards in Database Cache</span>
                <span className="text-3xl font-extrabold text-indigo-400">
                  {Object.keys(cardCache).length}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-zinc-900 border border-zinc-800/80 rounded-3xl p-6 lg:col-span-2 flex flex-col gap-6">
                <h3 className="text-lg font-bold text-white">Part of Speech Distribution</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {["n.", "v.", "adj.", "adv.", "prep.", "pron."].map((pos) => {
                    const total = VOCAB.filter((w) => w.pos === pos).length;
                    const mastered = VOCAB.filter(
                      (w) => w.pos === pos && progress.masteredIds.includes(w.id)
                    ).length;
                    const percent = Math.round((total / VOCAB.length) * 100);
                    const masteryPercent = Math.round((mastered / total) * 100) || 0;

                    return (
                      <div key={pos} className="bg-zinc-950 border border-zinc-800/50 rounded-xl p-4 flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-extrabold text-zinc-300 uppercase">
                            {pos === "n." ? "Noun" : pos === "v." ? "Verb" : pos === "adj." ? "Adjective" : pos === "adv." ? "Adverb" : pos === "prep." ? "Preposition" : "Pronoun"} ({pos})
                          </span>
                          <span className="text-xs text-zinc-500">{total} words ({percent}%)</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-[10px] text-zinc-500">
                            <span>Mastered: {mastered}/{total}</span>
                            <span>{masteryPercent}%</span>
                          </div>
                          <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${masteryPercent}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800/80 rounded-3xl p-6 flex flex-col gap-6 justify-between">
                <div className="flex flex-col gap-4">
                  <h3 className="text-lg font-bold text-white">Suggested Review</h3>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => {
                        setFlashcardDeckType("learning");
                        setActiveTab("flashcards");
                      }}
                      className="w-full flex items-center justify-between bg-zinc-950 hover:bg-zinc-800/50 border border-zinc-800 text-zinc-300 px-4 py-3 rounded-xl text-xs font-semibold transition"
                    >
                      <span>Study progress pool</span>
                      <span className="bg-zinc-800 text-indigo-400 px-2 py-0.5 rounded-md">
                        {VOCAB.length - progress.masteredIds.length} left
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        if (progress.starredIds.length === 0) return;
                        setFlashcardDeckType("starred");
                        setActiveTab("flashcards");
                      }}
                      disabled={progress.starredIds.length === 0}
                      className="w-full flex items-center justify-between bg-zinc-950 hover:bg-zinc-800/50 border border-zinc-800 text-zinc-300 px-4 py-3 rounded-xl text-xs font-semibold transition disabled:opacity-50"
                    >
                      <span>Review starred items</span>
                      <span className="bg-zinc-800 text-amber-400 px-2 py-0.5 rounded-md">
                        {progress.starredIds.length} starred
                      </span>
                    </button>
                  </div>
                </div>
                <div className="text-center text-[10px] text-zinc-600 font-semibold uppercase">
                  Cache auto-saved in local database
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ------------------------------------------------------------------------
            TAB 2: GRAMMAR FLASHCARDS
        ------------------------------------------------------------------------ */}
        {activeTab === "flashcards" && (
          <section className="flex flex-col items-center gap-6 max-w-5xl mx-auto w-full">
            <div className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-400">Deck:</span>
                <select
                  value={flashcardDeckType}
                  onChange={(e) => setFlashcardDeckType(e.target.value as any)}
                  className="bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs font-bold rounded-lg px-3 py-1.5 focus:outline-none"
                >
                  <option value="all">Full Dictionary ({VOCAB.length} words)</option>
                  <option value="learning">Study List ({VOCAB.length - progress.masteredIds.length} left)</option>
                  <option value="starred">Starred List ({progress.starredIds.length} items)</option>
                </select>
              </div>
              <div className="text-xs font-bold text-zinc-400 bg-zinc-850 px-3 py-1.5 rounded-lg">
                {flashcardWords.length === 0 ? "0 of 0" : `${currentCardIndex + 1} of ${flashcardWords.length}`}
              </div>
            </div>

            {flashcardWords.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-850 rounded-3xl p-12 text-center max-w-md w-full flex flex-col gap-4 items-center">
                <h3 className="text-lg font-bold text-white">This deck is empty</h3>
                <button onClick={() => setFlashcardDeckType("all")} className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-xs font-bold transition text-white">
                  Load All Words
                </button>
              </div>
            ) : (
              currentWordObj && (
                <div className="w-full flex flex-col gap-6 items-center">
                  {/* API Warning/Error Alert Banner */}
                  {apiError && (
                    <div className="w-full max-w-3xl bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 shrink-0">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        </div>
                        <div className="flex flex-col gap-0.5 text-left">
                          <span className="font-extrabold uppercase tracking-wider text-amber-400">Gemini API Warning ({apiError})</span>
                          <p className="text-zinc-400">Using dynamic local templates. Set a valid <code>GEMINI_API_KEY</code> in <code>.env.local</code> and restart the server to enable AI sentences.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Outer Flip Card Container */}
                  <div
                    onClick={() => {
                      if (!loadingAI) setIsFlipped((prev) => !prev);
                    }}
                    className="w-full max-w-3xl min-h-[380px] xs:min-h-[420px] sm:min-h-[500px] cursor-pointer card-perspective"
                  >
                    <div
                      className={`w-full h-full min-h-[380px] xs:min-h-[420px] sm:min-h-[500px] relative card-inner rounded-3xl border border-zinc-800 shadow-2xl ${
                        isFlipped ? "card-flipped" : ""
                      } ${
                        cardTransition === "swipe-left"
                          ? "swipe-left"
                          : cardTransition === "swipe-right"
                          ? "swipe-right"
                          : ""
                      }`}
                    >
                      {/* CARD FRONT: Shows Word, POS, and 5 Example Sentence Structures (STRICTLY ENGLISH) */}
                      <div className="absolute inset-0 card-face w-full h-full bg-zinc-900 rounded-3xl p-3.5 sm:p-6 md:p-8 flex flex-col justify-between shadow-lg overflow-y-auto">
                        <div className="w-full flex justify-between items-center border-b border-zinc-800/80 pb-2 sm:pb-3">
                          <span className={`text-[8.5px] sm:text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full ${getPosBadgeColor(currentWordObj.pos)}`}>
                            {currentWordObj.pos}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[8.5px] sm:text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Front: 5 English Structures</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStarred(currentWordObj.id);
                              }}
                              className="text-zinc-500 hover:text-amber-400 transition"
                            >
                              <svg
                                className={`w-5 h-5 sm:w-5.5 sm:h-5.5 ${
                                  progress.starredIds.includes(currentWordObj.id)
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-zinc-500"
                                }`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Title Word */}
                        <div className="my-4 sm:my-6 text-center">
                          <h3 className="text-2xl xs:text-3xl md:text-4xl font-black tracking-tight text-white inline-flex items-center gap-2.5 sm:gap-3 justify-center">
                            {currentWordObj.word}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                speakWord(currentWordObj.word);
                              }}
                              className="bg-zinc-800 hover:bg-zinc-700 p-1.5 sm:p-2 rounded-full text-zinc-300 hover:text-white transition"
                              title="Pronounce"
                            >
                              <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                              </svg>
                            </button>
                          </h3>
                        </div>

                        {/* 5 English Example Sentences */}
                        <div className="flex-1 flex flex-col gap-2.5 justify-center">
                          {loadingAI ? (
                            <div className="flex flex-col items-center gap-3">
                              <div className="w-7 h-7 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                              <span className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-widest">
                                Loading sentence data (fetching AI)...
                              </span>
                            </div>
                          ) : activeCardData ? (
                            <div className="flex flex-col gap-1.5 xs:gap-2 max-w-2xl mx-auto w-full text-left">
                              {activeCardData.sentences.map((s, idx) => (
                                <div key={idx} className="bg-zinc-950 border border-zinc-800/80 rounded-xl px-2.5 py-1.5 xs:px-3 xs:py-2 flex items-start gap-2.5 hover:border-zinc-700/80 transition">
                                  <span className="text-[8.5px] xs:text-[9.5px] sm:text-[10px] font-extrabold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded min-w-[48px] sm:min-w-[70px] text-center shrink-0">
                                    {s.structure}
                                  </span>
                                  <p className="text-[11px] xs:text-xs sm:text-sm font-semibold text-zinc-200 leading-snug">
                                    {s.sentence}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-500 text-center">Failed to load structure cards.</p>
                          )}
                        </div>

                        <div className="flex justify-center mt-3">
                          <span className="text-[9px] sm:text-[10px] text-zinc-500 font-extrabold uppercase tracking-widest text-center animate-pulse leading-snug">
                            Click card to flip and view translations / grammar structures
                          </span>
                        </div>
                      </div>

                      {/* CARD BACK: Shows Translations, Grammar breakdowns, and Memory Trick */}
                      <div className="absolute inset-0 card-face card-back w-full h-full bg-zinc-900 rounded-3xl p-3.5 sm:p-6 md:p-8 flex flex-col justify-between shadow-lg overflow-y-auto">
                        <div className="w-full flex justify-between items-center border-b border-zinc-800/80 pb-2 sm:pb-3">
                          <span className="text-[8.5px] sm:text-[10px] text-zinc-500 uppercase tracking-widest font-bold flex items-center gap-1.5">
                            Back: {currentWordObj.word} {activeCardData?.wordTranslation && `(แปลหลัก: ${activeCardData.wordTranslation})`}
                          </span>
                          <span className={`text-[8.5px] sm:text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full ${getPosBadgeColor(currentWordObj.pos)}`}>
                            {currentWordObj.pos}
                          </span>
                        </div>

                        {/* Translation List */}
                        <div className="flex-1 flex flex-col gap-2.5 justify-center py-2">
                          {activeCardData && (
                            <div className="flex flex-col gap-1.5 xs:gap-2 max-w-2xl mx-auto w-full text-left">
                              {activeCardData.sentences.map((s, idx) => (
                                <div key={idx} className="bg-zinc-950 border border-zinc-800/60 rounded-xl p-2.5 flex flex-col gap-1.5">
                                  <div className="flex items-center gap-2 text-[10px] sm:text-xs">
                                    <span className="font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[8.5px] xs:text-[9.5px]">
                                      {s.structure}
                                    </span>
                                    <span className="text-zinc-300 font-bold text-[11px] xs:text-xs">{s.sentence}</span>
                                  </div>
                                  <div className="pl-1.5 flex flex-col gap-0.5 border-l border-zinc-800 ml-1">
                                    <p className="text-[11px] xs:text-xs sm:text-sm font-bold text-indigo-300">
                                      แปล: {s.translation}
                                    </p>
                                    <p className="text-[9.5px] sm:text-[11px] text-zinc-500 font-semibold leading-normal">
                                      โครงสร้าง: {s.grammar}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Mnemonic Trick Section */}
                        {activeCardData?.trick && (
                          <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-3 flex gap-3 items-start mt-1.5">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                              </svg>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">ทริคการช่วยจำ (Mnemonic Trick)</span>
                              <p className="text-xs font-semibold text-zinc-200 leading-relaxed">
                                {activeCardData.trick}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Regenerate Button */}
                  <div className="w-full max-w-xl flex justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        regenerateCard();
                      }}
                      disabled={loadingAI}
                      className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 disabled:opacity-50 text-zinc-400 hover:text-white px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2"
                    >
                      <svg className={`w-3.5 h-3.5 ${loadingAI ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 6.891M21 21v-5h-.581m0 0a8.003 8.003 0 11-15.357-2" />
                      </svg>
                      {loadingAI ? "Regenerating..." : "Regenerate with AI"}
                    </button>
                  </div>

                  {/* Starred Notes Input Area */}
                  <div className="w-full max-w-xl bg-zinc-900 border border-zinc-850 rounded-2xl p-4 flex flex-col gap-3">
                    <label className="text-xs text-zinc-400 font-bold uppercase tracking-wider">
                      Add Custom Study Notes / Translations:
                    </label>
                    <textarea
                      value={progress.notes[currentWordObj.id] || ""}
                      onChange={(e) => saveNote(currentWordObj.id, e.target.value)}
                      placeholder="e.g. ละทิ้ง, ปล่อย, เลิกคิด / To leave behind permanently..."
                      rows={2}
                      className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 transition resize-none placeholder:text-zinc-600"
                    />
                  </div>

                  {/* Interactive Controls & Swipe Buttons */}
                  <div className="w-full max-w-xl flex items-center justify-between gap-4">
                    <button
                      onClick={() => handleCardPrev()}
                      className="flex-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 py-3 rounded-2xl text-xs font-extrabold text-zinc-300 transition flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      Previous
                    </button>

                    <button
                      onClick={() => {
                        const isMastered = progress.masteredIds.includes(currentWordObj.id);
                        if (!isMastered) toggleMastered(currentWordObj.id);
                        handleCardNext("swipe-right");
                      }}
                      className={`flex-1 py-3 rounded-2xl text-xs font-extrabold text-white transition flex items-center justify-center gap-2 shadow-lg ${
                        progress.masteredIds.includes(currentWordObj.id)
                          ? "bg-zinc-700 cursor-not-allowed opacity-50"
                          : "bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400"
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Mastered
                    </button>

                    <button
                      onClick={() => handleCardNext("swipe-left")}
                      className="flex-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 py-3 rounded-2xl text-xs font-extrabold text-zinc-300 transition flex items-center justify-center gap-2"
                    >
                      Skip
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>

                  <p className="text-[11px] text-zinc-500 text-center font-semibold uppercase tracking-widest hidden md:block">
                    Press <span className="text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded">Space</span> to flip •{" "}
                    <span className="text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded">← / →</span> to navigate
                  </p>
                </div>
              )
            )}
          </section>
        )}

        {/* ------------------------------------------------------------------------
            TAB 3: QUIZ ARENA
        ------------------------------------------------------------------------ */}
        {activeTab === "quiz" && (
          <section className="flex flex-col items-center gap-6 max-w-3xl mx-auto w-full">
            {!quizStarted ? (
              <div className="w-full flex flex-col gap-6">
                <div className="bg-zinc-900 border border-zinc-800/80 rounded-3xl p-6 md:p-8 text-center flex flex-col gap-2 shadow-xl">
                  <h2 className="text-2xl font-black text-white">Quiz Arena</h2>
                  <p className="text-sm text-zinc-400 max-w-md mx-auto">
                    Challenge yourself to reinforce your vocabulary memory. Select a mode to start playing.
                  </p>
                </div>

                {Object.keys(cardCache).length === 0 ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center flex flex-col items-center gap-4 shadow-md">
                    <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <div className="flex flex-col gap-1 max-w-md">
                      <h3 className="text-base font-bold text-white">Quiz Arena is Locked</h3>
                      <p className="text-xs text-zinc-400 leading-relaxed text-left md:text-center">
                        คุณยังไม่มีคำศัพท์ที่บันทึกในระบบแคชเลย ระบบต้องการคำศัพท์ที่เคยผ่านการเปิดดูการ์ดเพื่อนำมาใช้ตั้งคำถาม กรุณาเปิดดูการ์ดคำศัพท์ที่หน้าเมนู <strong>Grammar Cards</strong> อย่างน้อย 1 คำก่อน จึงจะสามารถปลดล็อกควิซนี้ได้ครับ!
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab("flashcards")}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl transition mt-2 shadow-md"
                    >
                      Go to Grammar Cards
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col justify-between gap-6 shadow-md hover:border-indigo-500/40 transition">
                      <div className="flex flex-col gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-bold text-white">Part of Speech</h3>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          Guess whether the highlighted word is a noun, verb, adjective, or other.
                        </p>
                      </div>
                      <button onClick={() => startQuiz("pos")} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs py-2.5 rounded-xl transition shadow-lg">
                        Start Mode
                      </button>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col justify-between gap-6 shadow-md hover:border-emerald-500/40 transition">
                      <div className="flex flex-col gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-bold text-white">Letter Scramble</h3>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          Unscramble letters to match the spelling of the vocab term.
                        </p>
                      </div>
                      <button onClick={() => startQuiz("spelling")} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs py-2.5 rounded-xl transition shadow-lg">
                        Start Mode
                      </button>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col justify-between gap-6 shadow-md hover:border-violet-500/40 transition">
                      <div className="flex flex-col gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-violet-500/10 text-violet-400 flex items-center justify-center">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-bold text-white">Missing Letters</h3>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          Fill in blanks (e.g. a_a_d_n) to correctly complete the word.
                        </p>
                      </div>
                      <button onClick={() => startQuiz("missing")} className="w-full bg-violet-600 hover:bg-violet-500 text-white font-extrabold text-xs py-2.5 rounded-xl transition shadow-lg">
                        Start Mode
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              currentQuizWord && (
                <div className="w-full flex flex-col gap-6 max-w-xl">
                  <div className="flex justify-between items-center bg-zinc-900 border border-zinc-800 px-6 py-3.5 rounded-2xl text-xs font-semibold">
                    <button onClick={() => setQuizStarted(false)} className="text-zinc-400 hover:text-zinc-200 transition flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7 7-7m8 14l-7-7 7-7" />
                      </svg>
                      Leave Quiz
                    </button>
                    <span className="text-indigo-400 font-extrabold uppercase">
                      {quizMode === "pos" ? "Part of Speech Quiz" : quizMode === "spelling" ? "Spelling Scramble" : "Missing Letters"}
                    </span>
                    <span className="text-zinc-300">
                      Score: <strong className="text-emerald-400">{quizScore}</strong>/{quizTotalQuestions}
                    </span>
                  </div>

                  <div className={`bg-zinc-900 border border-zinc-800 rounded-3xl p-8 flex flex-col items-center gap-4 text-center ${
                    quizFeedback === "correct" ? "animate-correct" : quizFeedback === "incorrect" ? "animate-shake" : ""
                  }`}>
                    {quizMode === "pos" ? (
                      <>
                        <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">What part of speech is</span>
                        <h2 className="text-3xl font-extrabold text-white tracking-tight">{currentQuizWord.word}</h2>
                      </>
                    ) : quizMode === "spelling" ? (
                      <>
                        <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">
                          Spell this word (Part of Speech: <strong className="text-indigo-400">{currentQuizWord.pos}</strong>)
                        </span>
                        <h2 className="text-xl font-bold tracking-widest text-emerald-400 font-mono select-none">{scrambledWord}</h2>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">
                          Fill in the blanks (Part of Speech: <strong className="text-indigo-400">{currentQuizWord.pos}</strong>)
                        </span>
                        <h2 className="text-3xl font-extrabold tracking-widest text-white font-mono">{missingLettersHint}</h2>
                      </>
                    )}
                    <button onClick={() => speakWord(currentQuizWord.word)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white p-2.5 rounded-full transition mt-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                    </button>
                  </div>

                  {quizMode === "pos" ? (
                    <div className="grid grid-cols-2 gap-4">
                      {quizOptions.map((opt) => {
                        const isChosen = selectedAnswer === opt;
                        const isCorrectOpt = opt === currentQuizWord.pos;
                        
                        let btnStyle = "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800/40 hover:border-zinc-700";
                        if (selectedAnswer !== null) {
                          if (isCorrectOpt) {
                            btnStyle = "bg-emerald-500/20 border-emerald-500/50 text-emerald-400";
                          } else if (isChosen) {
                            btnStyle = "bg-rose-500/20 border-rose-500/50 text-rose-400";
                          } else {
                            btnStyle = "bg-zinc-900/50 border-zinc-850 text-zinc-500 opacity-60";
                          }
                        }

                        return (
                          <button
                            key={opt}
                            disabled={selectedAnswer !== null}
                            onClick={() => checkPosAnswer(opt)}
                            className={`py-4 px-6 rounded-2xl border text-sm font-extrabold tracking-wide uppercase transition ${btnStyle}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={spellingInput}
                          disabled={selectedAnswer !== null}
                          onChange={(e) => setSpellingInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") checkAnswer(spellingInput);
                          }}
                          placeholder={quizMode === "spelling" ? "Type spelled word..." : "Type complete word..."}
                          className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-2xl px-4 py-3 text-sm text-zinc-100 focus:outline-none placeholder:text-zinc-600 font-medium"
                        />
                        <button
                          disabled={selectedAnswer !== null || !spellingInput.trim()}
                          onClick={() => checkAnswer(spellingInput)}
                          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-xs px-6 rounded-2xl transition"
                        >
                          Submit
                        </button>
                      </div>

                      {selectedAnswer !== null && (
                        <div className="bg-zinc-900 border border-zinc-850 p-4 rounded-2xl flex flex-col gap-1.5 text-center">
                          <span className={`text-xs font-extrabold uppercase ${quizFeedback === 'correct' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {quizFeedback === "correct" ? "Correct!" : "Incorrect"}
                          </span>
                          <span className="text-sm text-zinc-300 font-semibold">
                            Answer: <strong className="text-white font-extrabold">{currentQuizWord.word}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedAnswer !== null && (
                    <button
                      onClick={() => startNewQuizQuestion()}
                      className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-extrabold py-3.5 rounded-2xl text-xs tracking-wider uppercase transition shadow-lg mt-4"
                    >
                      Next Question
                    </button>
                  )}
                </div>
              )
            )}
          </section>
        )}

        {/* ------------------------------------------------------------------------
            TAB 4: WORD EXPLORER
        ------------------------------------------------------------------------ */}
        {activeTab === "explorer" && (
          <section className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-lg">
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider pl-1">Search Word</label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search over 1500 words..."
                    className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-200 focus:outline-none placeholder:text-zinc-600 transition"
                  />
                  <svg className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider pl-1">Part of Speech</label>
                <select
                  value={explorerPosFilter}
                  onChange={(e) => setExplorerPosFilter(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-sm font-semibold rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 transition"
                >
                  <option value="all">All POS</option>
                  {posList.map((pos) => <option key={pos} value={pos}>{pos}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider pl-1">Mastery Status</label>
                <select
                  value={explorerStatusFilter}
                  onChange={(e) => setExplorerStatusFilter(e.target.value as any)}
                  className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-sm font-semibold rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 transition"
                >
                  <option value="all">All Statuses</option>
                  <option value="learning">Need to Study</option>
                  <option value="mastered">Mastered</option>
                  <option value="starred">Starred</option>
                </select>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs font-semibold text-zinc-500 pl-2">
              <span>Found <strong className="text-zinc-300">{filteredWords.length}</strong> words match</span>
              <span>Showing {pagedWords.length} items</span>
            </div>

            {pagedWords.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-850 rounded-3xl p-12 text-center flex flex-col gap-3 items-center">
                <h3 className="text-sm font-bold text-white">No words found matching the criteria</h3>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {pagedWords.map((wordObj) => {
                    const isStarred = progress.starredIds.includes(wordObj.id);
                    const isMastered = progress.masteredIds.includes(wordObj.id);

                    return (
                      <div
                        key={wordObj.id}
                        className={`bg-zinc-900 border rounded-2xl p-4.5 flex flex-col justify-between gap-4 transition group ${
                          isMastered ? "border-emerald-500/20 bg-emerald-500/[0.01]" : "border-zinc-800/80 hover:border-zinc-700"
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className={`text-[9px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full ${getPosBadgeColor(wordObj.pos)}`}>
                            {wordObj.pos}
                          </span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => toggleStarred(wordObj.id)} className="text-zinc-600 hover:text-amber-400 transition">
                              <svg className={`w-5 h-5 ${isStarred ? "fill-amber-400 text-amber-400" : "text-zinc-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                              </svg>
                            </button>
                            <button onClick={() => speakWord(wordObj.word)} className="text-zinc-600 hover:text-zinc-300 transition">
                              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        <h4 className="text-base font-extrabold text-zinc-100 group-hover:text-white transition">{wordObj.word}</h4>

                        {progress.notes[wordObj.id] && (
                          <p className="text-xs text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 mt-1 italic">
                            {progress.notes[wordObj.id]}
                          </p>
                        )}

                        <div className="flex items-center justify-between border-t border-zinc-800/40 pt-2.5 mt-1">
                          <span className="text-[10px] text-zinc-500 font-semibold">
                            Status: <strong className={isMastered ? "text-emerald-400" : "text-zinc-400"}>{isMastered ? "Mastered" : "Learning"}</strong>
                          </span>
                          <button
                            onClick={() => toggleMastered(wordObj.id)}
                            className={`text-[10px] font-extrabold uppercase px-2.5 py-1.5 rounded-lg border transition ${
                              isMastered
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:text-zinc-300"
                                : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                            }`}
                          >
                            {isMastered ? "Reset" : "Mark Mastered"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {filteredWords.length > pagedWords.length && (
                  <button
                    onClick={() => setExplorerPage((prev) => prev + 1)}
                    className="w-full max-w-xs mx-auto bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 py-3.5 rounded-2xl text-xs font-extrabold uppercase tracking-wide transition flex items-center justify-center gap-2 mt-4"
                  >
                    Load More Words
                  </button>
                )}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
