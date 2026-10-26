// Exercise content. All text is original and written for this app.
// Level 1 and 2 use only home row keys (a s d f g h j k l ;) and spaces;
// a unit test enforces that.

export const LEVELS = [
  {
    id: 1,
    title: "Level 1: Home row drills",
    description: "Anchor on F and J, then reach out one finger at a time.",
    items: [
      "fff jjj fff jjj fj fj fj jf jf jf",
      "ddd kkk ddd kkk dk dk fd jk fdjk",
      "sss lll sss lll sl sl sd lk sdf jkl",
      "aaa ;;; aaa ;;; a; a; as ;l asdf jkl;",
      "asdf jkl; asdf jkl; fdsa ;lkj fdsa ;lkj",
      "ggg hhh fg jh fgf jhj gf hj fgh jhg",
      "asdfg hjkl; gfdsa ;lkjh asdfg hjkl;",
      "fj dk sl a; gh fj dk sl a; gh fjdksla;gh",
    ],
    // One tutorial per exercise, in the same order as items.
    tutorials: [
      {
        title: "Anchor on F and J",
        intro: "Every session starts here. Your index fingers rest on F and J. Feel the small bumps on those keys: they let you find home without looking.",
        tip: "Keep your other fingers resting on A S D and K L ; even though you won't press them yet.",
      },
      {
        title: "Middle fingers: D and K",
        intro: "Your middle fingers rest one key outward from your index fingers: the left middle on D, the right middle on K.",
        tip: "Press straight down. Your index fingers stay on F and J the whole time.",
      },
      {
        title: "Ring fingers: S and L",
        intro: "Your ring fingers rest on S and L. They are weaker than the others, so they need the most practice.",
        tip: "Go slowly at first. Speed comes after the right finger becomes a habit.",
      },
      {
        title: "Pinkies: A and ;",
        intro: "Your pinkies rest on A and the semicolon key. They are the smallest fingers, and the ones most people skip.",
        tip: "Lift and press from the knuckle, not the wrist, then let the pinky settle back on its key.",
      },
      {
        title: "All eight fingers together",
        intro: "Now every finger on the home row gets a turn. Each one presses only its own key.",
        tip: "Roll from the pinky to the index finger and back, like playing a scale.",
      },
      {
        title: "Index reach: G and H",
        intro: "G and H have no finger of their own. Your index fingers reach one key toward the middle, press, then come straight back to F and J.",
        tip: "Reach, press, return. The rest of your fingers stay home while you reach.",
      },
      {
        title: "The whole home row",
        intro: "All ten home-row keys in one line, including the G and H reaches.",
        tip: "Keep a steady rhythm instead of rushing. Even beats are faster in the end.",
      },
      {
        title: "Pairs across both hands",
        intro: "These pairs switch hands on every key: left, right, left, right.",
        tip: "Switching hands is how fast typists keep their rhythm. Let one hand get ready while the other presses.",
      },
    ],
  },
  {
    id: 2,
    title: "Level 2: Home row words",
    description: "Real words made only from home row letters.",
    items: [
      "sad dad add all fall hall lad",
      "ask has had gas lass glass flask",
      "a sad lad had a glass flask",
      "dad shall ask all lads",
      "salad flag dash flash half glad",
      "a glad dad has a half salad",
      "alfalfa salads; ask a lass; add a dash",
      "flash slash lash hash dash ash",
    ],
    tutorials: [
      {
        title: "Your first real words",
        intro: "Every word in Level 2 uses only home-row letters. Spell each one with the fingers you learned in Level 1.",
        tip: "Press Space with either thumb between words, and keep your fingers on home.",
      },
      {
        title: "Words with G and H",
        intro: "These words need the index-finger reaches: H in has and had, G in gas and glass.",
        tip: "Reach for G or H, then come straight back to F or J before the next letter.",
      },
      {
        title: "A short sentence",
        intro: "Your first sentence. It is all home-row letters, with A typed by your left pinky.",
        tip: "Read a whole word, then type it without looking at the keys.",
      },
      {
        title: "Double letters",
        intro: "Words like shall, add and all repeat a letter. The same finger presses twice.",
        tip: "Tap twice from the same spot. Don't move your hand between the two presses.",
      },
      {
        title: "Longer words",
        intro: "Salad, flash and glad are longer. Every letter is still on the home row.",
        tip: "Break long words into chunks: sal-ad, fl-ash. Finish one chunk, then the next.",
      },
      {
        title: "Smooth sentences",
        intro: "Another sentence, this time aiming for smooth, even typing.",
        tip: "Try to make the time between keys the same, like a drumbeat.",
      },
      {
        title: "The semicolon",
        intro: "This line uses the semicolon key, the right pinky's home key, to separate phrases.",
        tip: "Tap ; with your right pinky without moving the rest of your hand.",
      },
      {
        title: "Word families",
        intro: "Flash, slash, lash, hash, dash and ash all end the same way.",
        tip: "Feel the shared ending in your fingers, and let the start of each word change.",
      },
    ],
  },
  {
    id: 3,
    title: "Level 3: Sentences",
    description: "Full sentences that use every letter, with capitals and punctuation.",
    items: [
      "Our robotics club meets after school every Tuesday.",
      "Jasmine fixed the broken printer before the quiz began.",
      "Maya packed six juicy plums for the long bus ride home.",
      "Keep your wrists relaxed and let each finger find its key.",
      "The library will extend its hours during final exam week.",
      "Zoe volunteered to judge the science fair projects.",
      "Good typing habits save time on every essay you write.",
      "We watched a quiet video about how glaciers shape valleys.",
      "Practice for ten minutes a day, and your speed will grow.",
      "The band played jazz while the crowd waved bright flags.",
    ],
  },
];

export const HOME_ROW_CHARACTERS = new Set("asdfghjkl; ");

export function getLevel(levelId) {
  return LEVELS.find((level) => level.id === levelId) ?? null;
}

/** The exercise text for a level, wrapping around when the index runs past the end. */
export function getExerciseText(levelId, index) {
  const level = getLevel(levelId);
  if (!level) return null;
  const wrapped = ((index % level.items.length) + level.items.length) % level.items.length;
  return level.items[wrapped];
}

/**
 * The keys an exercise uses, in the order they first appear (spaces become "Space").
 * Each key appears once.
 */
export function keysInExercise(text) {
  const keys = [];
  for (const char of text) {
    const key = char === " " ? "Space" : char.toLowerCase();
    if (!keys.includes(key)) keys.push(key);
  }
  // Space last: the letters are what the exercise is about.
  return [...keys.filter((key) => key !== "Space"), ...(keys.includes("Space") ? ["Space"] : [])];
}

/**
 * The tutorial shown before an exercise, or null for levels without tutorials.
 * `keys` lists every key the exercise uses; `newKeys` the ones no earlier
 * exercise (in this level or an earlier one) has used.
 */
export function getTutorial(levelId, index) {
  const level = getLevel(levelId);
  if (!level?.tutorials) return null;
  const wrapped = ((index % level.items.length) + level.items.length) % level.items.length;
  const text = level.items[wrapped];
  // Keys already practiced: every exercise of earlier levels, and earlier exercises of this one.
  const practiced = [...LEVELS.filter((l) => l.id < levelId).flatMap((l) => l.items), ...level.items.slice(0, wrapped)];
  const earlier = new Set(practiced.flatMap((item) => keysInExercise(item)));
  const keys = keysInExercise(text);
  return {
    ...level.tutorials[wrapped],
    levelId,
    index: wrapped,
    count: level.items.length,
    text,
    keys,
    newKeys: keys.filter((key) => !earlier.has(key) && key !== "Space"),
  };
}
