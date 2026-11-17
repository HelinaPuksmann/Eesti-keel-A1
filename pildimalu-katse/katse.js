"use strict";

const IMAGE_MS = 2000;
const ANSWER_MS = 10000;
const species = {
  Kass: ["pildid/kassid/kass-1.jpg", "pildid/kassid/kass-2.jpg", "pildid/kassid/kass-3.jpg", "pildid/kassid/kass-4.jpg"],
  Koer: ["pildid/koerad/koer-1.jpg", "pildid/koerad/koer-2.jpg", "pildid/koerad/koer-3.jpg", "pildid/koerad/koer-4.jpg"],
};
const sequences = Object.keys(species).flatMap(first =>
  Object.keys(species).flatMap(second =>
    Object.keys(species).map(third => [first, second, third].join(" – "))
  )
);

const byId = id => document.getElementById(id);
const screens = ["intro", "stimulus", "question", "finish"].map(byId);
const start = byId("start");
const roundLabel = byId("round");
const photos = byId("photos");
const options = byId("options");
const timer = byId("timer");
const images = new Map();
const results = [];
let rounds;
let sessionId;
let startedAt;
let stage = "intro";
let imageOnset;
let questionOnset;
let exposure;
let interrupted;
let frame;

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeRounds() {
  // Kasuta kõiki järjestusi ning lisa üks juhuslik segajärjestus ja selle vastand.
  const mixed = shuffle(sequences.slice(1, -1))[0];
  const opposite = mixed.split(" – ").map(animal => animal === "Kass" ? "Koer" : "Kass").join(" – ");
  return shuffle([...sequences, mixed, opposite]).map(correct => {
    const available = Object.fromEntries(Object.entries(species).map(([animal, paths]) => [animal, shuffle(paths)]));
    const animals = correct.split(" – ");
    const paths = animals.map(animal => available[animal].pop());
    const distractors = shuffle(sequences.filter(sequence => sequence !== correct)).slice(0, 2);
    return { correct, animals, paths, choices: shuffle([correct, ...distractors]) };
  });
}

function show(screen) {
  stage = screen;
  for (const section of screens) section.hidden = section.id !== screen;
  byId(screen + "-title").focus({ preventScroll: true });
}

function showRound() {
  const round = rounds[results.length];
  interrupted = document.hidden;
  questionOnset = undefined;
  roundLabel.hidden = false;
  roundLabel.textContent = `Voor ${results.length + 1} / ${rounds.length}`;
  photos.replaceChildren(...round.paths.map((path, index) => {
    const image = images.get(path);
    image.alt = round.animals[index];
    return image;
  }));
  show("stimulus");
  frame = requestAnimationFrame(() => {
    imageOnset = performance.now();
    frame = requestAnimationFrame(checkExposure);
  });
}

function checkExposure() {
  exposure = performance.now() - imageOnset;
  if (exposure < IMAGE_MS) {
    frame = requestAnimationFrame(checkExposure);
    return;
  }
  showQuestion();
}

function showQuestion() {
  photos.replaceChildren();
  const round = rounds[results.length];
  options.replaceChildren(...round.choices.map((choice, index) => {
    const button = document.createElement("button");
    const letter = document.createElement("span");
    button.type = "button";
    button.className = "option";
    letter.textContent = ["A", "B", "C"][index];
    button.append(letter, document.createTextNode(choice));
    button.addEventListener("click", () => recordAnswer(choice));
    return button;
  }));
  timer.textContent = "Aega 10 s";
  questionOnset = performance.now();
  show("question");
  frame = requestAnimationFrame(updateTimer);
}

function updateTimer() {
  const remaining = ANSWER_MS - (performance.now() - questionOnset);
  if (remaining <= 0) {
    recordAnswer();
    return;
  }
  const label = `Aega ${Math.ceil(remaining / 1000)} s`;
  if (timer.textContent !== label) timer.textContent = label;
  frame = requestAnimationFrame(updateTimer);
}

function recordAnswer(choice) {
  if (stage !== "question") return;
  const elapsed = performance.now() - questionOnset;
  const timedOut = choice === undefined || elapsed >= ANSWER_MS;
  const round = rounds[results.length];
  cancelAnimationFrame(frame);
  results.push([
    sessionId, startedAt, results.length + 1, ...round.paths, round.correct,
    ...round.choices, timedOut ? "" : choice,
    timedOut ? "" : round.choices.indexOf(choice) + 1,
    timedOut ? 0 : Number(choice === round.correct),
    timedOut ? "" : Math.round(elapsed), Number(timedOut),
    Math.round(exposure), Number(interrupted),
  ]);
  if (results.length < rounds.length) {
    showRound();
    return;
  }
  roundLabel.hidden = true;
  show("finish");
  downloadResults();
}

function downloadResults() {
  const headers = [
    "katse_id", "algusaeg_utc", "voor", "vasak_pilt", "keskmine_pilt", "parem_pilt",
    "õige_järjekord", "valik_a", "valik_b", "valik_c", "vastus", "vastuse_asukoht",
    "õige", "vastamisaeg_ms", "aeg_läbi", "piltide_kuvamise_aeg_ms", "vaheleht_peidetud",
  ];
  const csv = [headers, ...results].map(row =>
    row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(";")
  ).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `pildimalu-${sessionId}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && (stage === "stimulus" || stage === "question")) interrupted = true;
});

start.addEventListener("click", () => {
  sessionId = Array.from(crypto.getRandomValues(new Uint8Array(12)), byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  startedAt = new Date().toISOString();
  rounds = makeRounds();
  showRound();
});

byId("download").addEventListener("click", downloadResults);

Promise.all(Object.values(species).flat().map(async path => {
  const image = new Image();
  image.src = path;
  await image.decode();
  images.set(path, image);
})).then(() => {
  start.disabled = false;
  byId("load-status").hidden = true;
}).catch(() => {
  byId("load-status").textContent = "Pilte ei õnnestunud laadida. Veendu, et kaust „pildid“ on HTML-faili kõrval, ja laadi leht uuesti.";
});
