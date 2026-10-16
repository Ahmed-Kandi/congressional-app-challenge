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
