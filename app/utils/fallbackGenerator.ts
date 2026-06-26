import { Word } from "../types";

export interface CardData {
  wordTranslation: string; // Thai translation of the vocabulary word itself
  thaiPronunciation?: string; // Thai phonetic pronunciation / reading of the word itself
  sentences: {
    structure: string;
    sentence: string;
    translation: string;
    thaiPronunciation?: string; // Thai phonetic pronunciation of the sentence itself
    grammar: string;
  }[];
  trick: string;
}

const WORD_MAP: Record<string, string> = {
  // Subjects
  "the": "เดอะ",
  "manager": "แมนเนเจอร์",
  "team": "ทีม",
  "our": "เอาเวอร์",
  "teacher": "ทีชเชอร์",
  "scientist": "ไซเอนทิสท์",
  "children": "ชิลเดรน",
  "a": "อะ",
  "nurse": "เนิร์ส",
  "students": "สทิวเดนท์ส",
  "workers": "เวิร์กเกอร์ส",
  "she": "ชี",
  "they": "เด",
  "we": "วี",
  "he": "ฮี",
  "dog": "ด็อก",
  "arrived": "อะไรฟด์",
  "safely": "เซฟลี",

  // Objects & Nouns
  "new": "นิว",
  "policy": "โพลีซี",
  "project": "โปรเจกต์",
  "challenge": "แชลเลนจ์",
  "this": "ดิส",
  "opportunity": "ออพพอร์ทูนิตี",
  "message": "เมสเสจ",
  "old": "โอลด์",
  "house": "เฮ้าส์",
  "idea": "ไอเดีย",
  "design": "ดีไซน์",
  "their": "แดร์",
  "work": "เวิร์ก",
  "item": "ไอเทม",
  "beautiful": "บิวตี้ฟูล",
  "clean": "คลีน",
  "quick": "ควิก",
  "priority": "ไพรออริที",
  "top": "ท็อป",
  "reward": "รีวอร์ด",

  // Adjectives
  "happy": "แฮปปี้",
  "difficult": "ดิฟฟิคัลท์",
  "clear": "เคลียร์",
  "important": "อิมพอร์แทนท์",
  "exciting": "อิกไซทิง",
  "strange": "สเตรนจ์",
  "necessary": "เนเซสเซอรี",
  "perfect": "เพอร์เฟกต์",
  "tired": "ไทเอิร์ด",
  "successful": "ซัคเซสฟูล",
  "special": "สเปเชียล",
  "some": "ซัม",
  "gifts": "กิฟท์ส",

  // Grammar particles & common verbs
  "yesterday": "เยสเทอร์เดย์",
  "tomorrow": "ทูมอร์โรว์",
  "will": "วิล",
  "is": "อีส",
  "are": "อาร์",
  "was": "วอส",
  "were": "เวียร์",
  "to": "ทู",
  "gave": "เกฟ",
  "give": "กิฟ",
  "bought": "บอท",
  "found": "เฟานด์",
  "made": "เมด",
  "feels": "ฟีลส์",
  "plans": "แพลนส์",
  "plan": "แพลน",
  "book": "บุ๊ก",
  "student": "สทิวเดนท์",
  "staff": "สตาฟ",
  "acted": "แอคทิด",
  "understood": "อันเดอร์สทูด",
  "presentation": "พรีเซนเทชัน",
  "answer": "แอนเซอร์",
  "consider": "คอนซิเดอร์",
  "task": "ทาสก์",
  "completed": "คอมพลีทิด",
  "partners": "พาร์ทเนอร์ส",
  "apple": "แอปเปิล",
  "an": "แอน",
  "cried": "ไครด์",
  "child": "ชายล์ด",
  "ate": "เอท",
  "cake": "เค้ก",
  "water": "วอเตอร์",
  "became": "บีเคม",
  "cold": "โคลด์",
  "money": "มันนี่",
  "completely": "คอมพลีทลี",
};

export function transliterateWord(word: string): string {
  const lower = word.toLowerCase().replace(/[^a-z]/g, "");
  if (WORD_MAP[lower]) return WORD_MAP[lower];
  
  // Basic letter-by-letter approximation if not found
  let result = "";
  const map: Record<string, string> = {
    a: "แอน", b: "บ", c: "ค", d: "ด", e: "เอ", f: "ฟ", g: "ก", h: "ฮ",
    i: "อิ", j: "จ", k: "ค", l: "ล", m: "ม", n: "น", o: "อ", p: "พ",
    q: "คิว", r: "ร", s: "ส", t: "ท", u: "อุ", v: "ว", w: "ว", x: "กส์",
    y: "ย", z: "ซ"
  };
  
  for (let i = 0; i < lower.length; i++) {
    const char = lower[i];
    result += map[char] || "";
  }
  return result || word;
}

export function englishToThaiPhonetic(sentence: string): string {
  const clean = sentence.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
  const words = clean.split(/\s+/);
  return words.map(w => {
    if (w.toLowerCase().endsWith("ed") && w.length > 2) {
      const base = w.slice(0, -2);
      return transliterateWord(base) + "ด์";
    }
    return transliterateWord(w);
  }).join(" ");
}

const SUBJECTS = [
  "The manager", "The team", "Our teacher", "The scientist", "The children",
  "A nurse", "The students", "The workers", "She", "They", "We", "He", "The dog"
];

const OBJECTS = [
  "the new policy", "the project", "the challenge", "this opportunity", 
  "the message", "the old house", "a new idea", "the design", "their work"
];

const ADJECTIVES = [
  "happy", "difficult", "clear", "important", "exciting", "strange", 
  "necessary", "perfect", "tired", "successful"
];

function getRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateFallbackCard(wordObj: Word): CardData {
  const { word, pos } = wordObj;
  const w = word.split(",")[0].replace(/-$/, "").trim();

  const subj = getRandom(SUBJECTS);
  const obj = getRandom(OBJECTS);
  const adj = getRandom(ADJECTIVES);

  // Mock translation for fallback
  const mockTranslation = `คำแปลของคำว่า "${w}"`;
  const mockPronunciation = transliterateWord(w);

  let cardData: CardData;

  if (pos === "v.") {
    cardData = {
      wordTranslation: mockTranslation,
      thaiPronunciation: mockPronunciation,
      sentences: [
        {
          structure: "S + V",
          sentence: `${subj} ${w}ed yesterday.`,
          translation: `${subj} ได้ทำการ ${w} ไปเมื่อวานนี้`,
          grammar: `S (${subj}: ประธาน) + V (${w}ed: ทำการ${w} (อดีต))`
        },
        {
          structure: "S + V + O",
          sentence: `They will ${w} ${obj}.`,
          translation: `พวกเขาจะทำการ ${w} ${obj}`,
          grammar: `S (They: พวกเขา) + V (will ${w}: จะทำการ${w}) + O (${obj}: ${obj})`
        },
        {
          structure: "S + V + C",
          sentence: `To ${w} is ${adj}.`,
          translation: `การ ${w} นั้นเป็นเรื่องที่ ${adj}`,
          grammar: `S (To ${w}: การ${w}) + V (is: คือ/เป็น) + C (${adj}: ${adj})`
        },
        {
          structure: "S + V + IO + DO",
          sentence: `He gave the ${w}ed team a reward.`,
          translation: `เขาได้มอบรางวัลให้แก่ทีมที่ถูก ${w}`,
          grammar: `S (He: เขา) + V (gave: มอบให้) + IO (the ${w}ed team: ทีมที่ถูก${w}) + DO (a reward: รางวัล)`
        },
        {
          structure: "S + V + O + C",
          sentence: `We found the plan completely ${w}ed.`,
          translation: `พวกเราพบว่าแผนการถูก ${w} ไปอย่างสิ้นเชิง`,
          grammar: `S (We: พวกเรา) + V (found: พบว่า) + O (the plan: แผนการ) + C (completely ${w}ed: ถูก${w}ไปอย่างสิ้นเชิง)`
        }
      ],
      trick: `เมื่อเห็นคำกริยา "${w}" ให้จินตนาการถึงการกระทำและนำไปฝึกแต่งประโยคสั้นๆ เพื่อให้จำได้ง่ายขึ้น`
    };
  } else if (pos === "n.") {
    cardData = {
      wordTranslation: mockTranslation,
      thaiPronunciation: mockPronunciation,
      sentences: [
        {
          structure: "S + V",
          sentence: `The ${w} arrived safely.`,
          translation: `${w} ได้มาถึงอย่างปลอดภัยแล้ว`,
          grammar: `S (The ${w}: ${w}) + V (arrived: มาถึง)`
        },
        {
          structure: "S + V + O",
          sentence: `${subj} bought a new ${w}.`,
          translation: `${subj} ได้ซื้อ ${w} อันใหม่มา`,
          grammar: `S (${subj}: ประธาน) + V (bought: ซื้อ) + O (a new ${w}: ${w}อันใหม่)`
        },
        {
          structure: "S + V + C",
          sentence: `This item is a beautiful ${w}.`,
          translation: `สิ่งของชิ้นนี้เป็น ${w} ที่สวยงาม`,
          grammar: `S (This item: สิ่งของชิ้นนี้) + V (is: คือ/เป็น) + C (a beautiful ${w}: ${w}ที่สวยงาม)`
        },
        {
          structure: "S + V + IO + DO",
          sentence: `She gave the ${w} a quick clean.`,
          translation: `เธอเช็ดทำความสะอาด ${w} อย่างรวดเร็ว`,
          grammar: `S (She: เธอ) + V (gave: ให้) + IO (the ${w}: ${w}) + DO (a quick clean: การทำความสะอาดอย่างรวดเร็ว)`
        },
        {
          structure: "S + V + O + C",
          sentence: `They made this ${w} their top priority.`,
          translation: `พวกเขาทำให้ ${w} นี้เป็นสิ่งที่สำคัญที่สุด`,
          grammar: `S (They: พวกเขา) + V (made: ทำให้) + O (this ${w}: ${w}นี้) + C (their top priority: สิ่งสำคัญที่สุดของพวกเขา)`
        }
      ],
      trick: `คำนาม "${w}" สามารถจดจำโดยการผูกเข้ากับภาพสิ่งของหรือวาดภาพลงในโน้ตสมอง`
    };
  } else if (pos === "adj.") {
    cardData = {
      wordTranslation: mockTranslation,
      thaiPronunciation: mockPronunciation,
      sentences: [
        {
          structure: "S + V",
          sentence: `${subj} feels ${w}.`,
          translation: `${subj} รู้สึก ${w}`,
          grammar: `S (${subj}: ประธาน) + V (feels: รู้สึก) + C (${w}: ${w})`
        },
        {
          structure: "S + V + O",
          sentence: `She bought some ${w} gifts.`,
          translation: `เธอซื้อของขวัญที่ ${w} มาหลายชิ้น`,
          grammar: `S (She: เธอ) + V (bought: ซื้อ) + O (some ${w} gifts: ของขวัญที่${w})`
        },
        {
          structure: "S + V + C",
          sentence: `The current project is ${w}.`,
          translation: `โครงการในปัจจุบันนี้เป็นสิ่งที่ ${w}`,
          grammar: `S (The current project: โครงการปัจจุบัน) + V (is: เป็น/คือ) + C (${w}: ${w})`
        },
        {
          structure: "S + V + IO + DO",
          sentence: `He bought the ${w} student a book.`,
          translation: `เขาซื้อหนังสือให้แก่เด็กนักเรียนที่มีลักษณะ ${w}`,
          grammar: `S (He: เขา) + V (bought: ซื้อ) + IO (the ${w} student: นักเรียนที่${w}) + DO (a book: หนังสือ)`
        },
        {
          structure: "S + V + O + C",
          sentence: `The manager made the staff ${w}.`,
          translation: `ผู้จัดการทำให้พนักงานรู้สึก ${w}`,
          grammar: `S (The manager: ผู้จัดการ) + V (made: ทำให้) + O (the staff: พนักงาน) + C (${w}: ${w})`
        }
      ],
      trick: `จดจำคำคุณศัพท์ "${w}" โดยจินตนาการถึงความรู้สึกหรือลักษณะภายนอกที่เด่นชัด`
    };
  } else {
    cardData = {
      wordTranslation: mockTranslation,
      thaiPronunciation: mockPronunciation,
      sentences: [
        {
          structure: "S + V",
          sentence: `${subj} acted ${w}.`,
          translation: `${subj} ได้ปฏิบัติอย่าง ${w}`,
          grammar: `S (${subj}: ประธาน) + V (acted: ปฏิบัติ/แสดงออก) + M (${w}: อย่าง${w})`
        },
        {
          structure: "S + V + O",
          sentence: `We understood ${obj} ${w}.`,
          translation: `พวกเราเข้าใจ ${obj} อย่าง ${w}`,
          grammar: `S (We: พวกเรา) + V (understood: เข้าใจ) + O (${obj}: ${obj}) + M (${w}: อย่าง${w})`
        },
        {
          structure: "S + V + C",
          sentence: `The presentation was ${w} ${adj}.`,
          translation: `การนำเสนอนั้น ${w} ${adj} มาก`,
          grammar: `S (The presentation: การนำเสนอ) + V (was: เป็น/คือ) + C (${adj}: ${adj}) + M (${w}: อย่าง${w})`
        },
        {
          structure: "S + V + IO + DO",
          sentence: `She gave them a ${w} clear answer.`,
          translation: `เธอตอบคำถามให้พวกเขาเข้าใจกระจ่างแจ้งอย่าง ${w}`,
          grammar: `S (She: เธอ) + V (gave: ให้) + IO (them: พวกเขา) + DO (a ${w} clear answer: คำตอบที่ชัดเจนอย่าง${w})`
        },
        {
          structure: "S + V + O + C",
          sentence: `We consider the task ${w} completed.`,
          translation: `พวกเราถือว่าภารกิจสำเร็จลงแล้วอย่าง ${w}`,
          grammar: `S (We: พวกเรา) + V (consider: ถือว่า) + O (the task: ภารกิจ) + C (completed: เสร็จสิ้น) + M (${w}: อย่าง${w})`
        }
      ],
      trick: `คำว่า "${w}" เป็นคำขยาย ให้ลองจับคู่เข้ากับกริยาหรือคุณศัพท์ที่เห็นบ่อยๆ`
    };
  }

  cardData.sentences = cardData.sentences.map(s => ({
    ...s,
    thaiPronunciation: englishToThaiPhonetic(s.sentence)
  }));

  return cardData;
}
