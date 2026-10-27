// Show the same short essay at two typing speeds on the About page.
// Five characters count as one word, the usual typing-test convention.

const CHARACTERS_PER_WORD = 5;

function createRunner(card) {
  const copy = card.querySelector(".about-essay-copy");
  const text = copy.textContent.trim();
  const wpm = Number(card.dataset.essayWpm);
  const accessibleCopy = document.createElement("span");
  accessibleCopy.className = "visually-hidden";
  accessibleCopy.textContent = `Essay at ${wpm} words per minute: ${text}`;
  copy.before(accessibleCopy);
  copy.setAttribute("aria-hidden", "true");
  copy.replaceChildren();

  const characters = [];
  for (const token of text.match(/\S+|\s+/g) ?? []) {
    if (/^\s+$/.test(token)) {
      copy.append(document.createTextNode(token));
      characters.push(...Array.from(token, () => null));
      continue;
    }
    const word = document.createElement("span");
    word.className = "about-essay-word";
    for (const letter of token) {
      const character = document.createElement("span");
      character.className = "about-essay-char";
      character.textContent = letter;
      word.append(character);
      characters.push(character);
    }
    copy.append(word);
  }

  return { characters, wpm, shown: 0, caret: null };
}

export function createAboutEssayDemo({ section, replayButton }) {
  const runners = [...section.querySelectorAll("[data-essay-wpm]")].map(createRunner);
  let observer = null;
  let frameId = 0;
  let started = false;

  function showCharacters(runner, count) {
    if (count === runner.shown) return;
    runner.caret?.classList.remove("is-next");
    for (let i = runner.shown; i < count; i += 1) {
      runner.characters[i]?.classList.add("is-typed");
    }
    runner.shown = count;
    runner.caret = runner.characters.slice(count).find(Boolean) ?? null;
    runner.caret?.classList.add("is-next");
  }

  function reset() {
    for (const runner of runners) {
      for (const character of runner.characters) character?.classList.remove("is-typed", "is-next");
      runner.shown = 0;
      runner.caret = runner.characters.find(Boolean) ?? null;
      runner.caret?.classList.add("is-next");
    }
  }

  function leave() {
    observer?.disconnect();
    observer = null;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    started = false;
  }

  function start() {
    if (started) return;
    observer?.disconnect();
    observer = null;
    started = true;
    const startTime = performance.now() + 350;
    const animate = (now) => {
      const elapsed = Math.max(0, now - startTime);
      let complete = true;
      for (const runner of runners) {
        const count = Math.min(runner.characters.length,
          Math.floor(elapsed * runner.wpm * CHARACTERS_PER_WORD / 60000));
        showCharacters(runner, count);
        if (count < runner.characters.length) complete = false;
      }
      frameId = complete ? 0 : requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
  }

  function enter() {
    leave();
    reset();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const runner of runners) showCharacters(runner, runner.characters.length);
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      start();
      return;
    }
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) start();
    }, { threshold: 0.15 });
    observer.observe(section);
  }

  replayButton.addEventListener("click", () => {
    leave();
    reset();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const runner of runners) showCharacters(runner, runner.characters.length);
    } else {
      start();
    }
  });

  return { enter, leave };
}
