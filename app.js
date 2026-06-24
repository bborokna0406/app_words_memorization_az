// 이 키는 앱 업데이트 후에도 기존 단어를 유지하기 위해 변경하지 않습니다.
const STORAGE_KEY = "azerbaijani-words-memorization-v1";
const APP_VERSION = "2026.06.24.1";

const azeriCollator = new Intl.Collator("az", {
  usage: "sort",
  sensitivity: "base",
});

const state = {
  words: [],
  editingId: null,
  currentQuestion: null,
  answerVisible: false,
  sortMode: "recent",
  studyQueue: [],
  studyIndex: 0,
  completedCycles: 0,
  cycleComplete: false,
};

const elements = {
  summaryText: document.querySelector("#summaryText"),
  appVersion: document.querySelector("#appVersion"),
  wordForm: document.querySelector("#wordForm"),
  wordInput: document.querySelector("#wordInput"),
  meaningInput: document.querySelector("#meaningInput"),
  saveButton: document.querySelector("#saveButton"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  editBadge: document.querySelector("#editBadge"),
  wordList: document.querySelector("#wordList"),
  emptyText: document.querySelector("#emptyText"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  studyButton: document.querySelector("#studyButton"),
  answerButton: document.querySelector("#answerButton"),
  quizLabel: document.querySelector("#quizLabel"),
  quizText: document.querySelector("#quizText"),
  answerText: document.querySelector("#answerText"),
  studyModeText: document.querySelector("#studyModeText"),
  exportButton: document.querySelector("#exportButton"),
  importButton: document.querySelector("#importButton"),
  fileInput: document.querySelector("#fileInput"),
  toast: document.querySelector("#toast"),
};

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeWordItem(item) {
  return {
    id: item.id || createId(),
    word: normalizeText(item.word),
    meaning: normalizeText(item.meaning),
    createdAt: Number(item.createdAt) || Date.now(),
  };
}

function loadWords() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    state.words = saved
      ? JSON.parse(saved).map(normalizeWordItem).filter((item) => item.word && item.meaning)
      : [];
  } catch {
    state.words = [];
    showToast("저장된 데이터를 읽지 못했습니다.");
  }
}

function saveWords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.words));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 1800);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSummary() {
  elements.summaryText.textContent = `저장된 단어 ${state.words.length}개`;
  elements.appVersion.textContent = `v${APP_VERSION}`;
}

function renderList() {
  const query = normalizeText(elements.searchInput.value).toLocaleLowerCase("az");
  const filteredWords = state.words.filter((item) => {
    return item.word.toLocaleLowerCase("az").includes(query)
      || item.meaning.toLocaleLowerCase("ko").includes(query);
  });

  if (state.sortMode === "pronunciation") {
    filteredWords.sort((a, b) => azeriCollator.compare(a.word, b.word));
  }

  elements.wordList.innerHTML = filteredWords.map((item) => `
    <li class="word-item" data-id="${escapeHtml(item.id)}">
      <div class="word-main">
        <strong lang="az">${escapeHtml(item.word)}</strong>
        <span>${escapeHtml(item.meaning)}</span>
      </div>
      <div class="item-actions">
        <button type="button" data-action="edit" title="수정" aria-label="${escapeHtml(item.word)} 수정">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button class="delete-button" type="button" data-action="delete" title="삭제" aria-label="${escapeHtml(item.word)} 삭제">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
        </button>
      </div>
    </li>
  `).join("");

  elements.emptyText.hidden = filteredWords.length > 0;
  elements.emptyText.textContent = state.words.length === 0
    ? "아직 저장된 단어가 없습니다."
    : "검색 결과가 없습니다.";
}

function renderStudyControls() {
  const hasWords = state.words.length > 0;
  elements.studyButton.disabled = !hasWords;
  elements.answerButton.disabled = !state.currentQuestion;

  if (!hasWords) {
    elements.quizLabel.textContent = "문제";
    elements.quizText.textContent = "단어를 추가하면 바로 학습할 수 있습니다.";
    elements.answerText.hidden = true;
    elements.studyModeText.textContent = "준비됨";
    elements.studyButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>시작';
    return;
  }

  if (state.cycleComplete) {
    return;
  }

  if (!state.currentQuestion) {
    elements.quizLabel.textContent = "문제";
    elements.quizText.textContent = "시작을 누르면 무작위 문제가 나옵니다.";
    elements.answerText.hidden = true;
    elements.studyModeText.textContent = "대기 중";
    elements.studyButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>시작';
  }
}

function resetStudySession() {
  state.currentQuestion = null;
  state.answerVisible = false;
  state.studyQueue = [];
  state.studyIndex = 0;
  state.completedCycles = 0;
  state.cycleComplete = false;
}

function shuffleWordIds() {
  const ids = state.words.map((item) => item.id);

  for (let index = ids.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [ids[index], ids[randomIndex]] = [ids[randomIndex], ids[index]];
  }

  return ids;
}

function startNextCycle() {
  state.studyQueue = shuffleWordIds();
  state.studyIndex = 0;
  state.currentQuestion = null;
  state.answerVisible = false;
  state.cycleComplete = false;
}

function showCycleComplete() {
  state.completedCycles += 1;
  state.cycleComplete = true;
  state.currentQuestion = null;
  state.answerVisible = false;

  elements.quizLabel.textContent = `${state.completedCycles}회독 완료`;
  elements.quizText.textContent = `목록의 ${state.words.length}개 단어를 모두 확인했습니다.`;
  elements.answerText.textContent = `다음을 누르면 단어를 다시 섞어 ${state.completedCycles + 1}회독을 시작합니다.`;
  elements.answerText.hidden = false;
  elements.studyModeText.textContent = `${state.completedCycles}회독 완료`;
  elements.studyButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>다음';
  elements.answerButton.disabled = true;
}

function render() {
  renderSummary();
  renderList();
  renderStudyControls();
}

function clearForm() {
  state.editingId = null;
  elements.wordInput.value = "";
  elements.meaningInput.value = "";
  elements.editBadge.hidden = true;
  elements.cancelEditButton.hidden = true;
  elements.saveButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>저장';
}

function upsertWord(event) {
  event.preventDefault();

  const word = normalizeText(elements.wordInput.value);
  const meaning = normalizeText(elements.meaningInput.value);

  if (!word || !meaning) {
    showToast("단어와 뜻을 모두 입력하세요.");
    return;
  }

  const duplicate = state.words.find((item) => {
    return item.word.toLocaleLowerCase("az") === word.toLocaleLowerCase("az")
      && item.id !== state.editingId;
  });

  if (duplicate) {
    duplicate.meaning = meaning;
    showToast("이미 있는 단어의 뜻을 수정했습니다.");
  } else if (state.editingId) {
    const target = state.words.find((item) => item.id === state.editingId);
    if (target) {
      target.word = word;
      target.meaning = meaning;
      showToast("단어를 수정했습니다.");
    }
  } else {
    state.words.unshift({ id: createId(), word, meaning, createdAt: Date.now() });
    showToast("단어를 저장했습니다.");
  }

  saveWords();
  resetStudySession();
  clearForm();
  render();
}

function editWord(id) {
  const target = state.words.find((item) => item.id === id);
  if (!target) return;

  state.editingId = id;
  elements.wordInput.value = target.word;
  elements.meaningInput.value = target.meaning;
  elements.editBadge.hidden = false;
  elements.cancelEditButton.hidden = false;
  elements.saveButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>수정';
  elements.wordInput.focus();
}

function deleteWord(id) {
  const target = state.words.find((item) => item.id === id);
  if (!target) return;

  const confirmed = confirm(`'${target.word}' 단어를 삭제할까요?`);
  if (!confirmed) return;

  state.words = state.words.filter((item) => item.id !== id);
  resetStudySession();

  saveWords();
  clearForm();
  render();
  showToast("단어를 삭제했습니다.");
}

function pickQuestion() {
  if (state.words.length === 0) return;

  if (state.cycleComplete || state.studyQueue.length === 0) {
    startNextCycle();
  } else if (state.currentQuestion && state.studyIndex >= state.studyQueue.length) {
    showCycleComplete();
    return;
  }

  const itemId = state.studyQueue[state.studyIndex];
  const item = state.words.find((word) => word.id === itemId);
  if (!item) {
    startNextCycle();
    pickQuestion();
    return;
  }

  state.studyIndex += 1;
  const askWord = Math.random() < 0.5;

  state.currentQuestion = {
    id: item.id,
    prompt: askWord ? item.word : item.meaning,
    answer: askWord ? item.meaning : item.word,
    label: askWord ? "다음 단어의 뜻" : "다음 뜻에 해당하는 아제르바이잔어",
  };
  state.answerVisible = false;

  elements.quizLabel.textContent = `${state.studyIndex} / ${state.studyQueue.length} · ${state.currentQuestion.label}`;
  elements.quizText.textContent = state.currentQuestion.prompt;
  elements.answerText.hidden = true;
  elements.answerText.textContent = "";
  elements.studyModeText.textContent = `${state.completedCycles + 1}회독 학습 중`;
  elements.studyButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>다음';
  elements.answerButton.disabled = false;
}

function showAnswer() {
  if (!state.currentQuestion) return;
  state.answerVisible = true;
  elements.answerText.textContent = `정답: ${state.currentQuestion.answer}`;
  elements.answerText.hidden = false;
}

function exportWords() {
  const data = {
    app: "azerbaijani-words-memorization",
    exportedAt: new Date().toISOString(),
    words: state.words,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "azerbaijani-words-backup.json";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("백업 파일을 만들었습니다.");
}

function importWords(file) {
  const reader = new FileReader();

  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const sourceWords = Array.isArray(parsed) ? parsed : parsed.words;
      if (!Array.isArray(sourceWords)) throw new Error("Invalid backup");

      const imported = sourceWords
        .map(normalizeWordItem)
        .filter((item) => item.word && item.meaning);

      const byWord = new Map(state.words.map((item) => [item.word.toLocaleLowerCase("az"), item]));
      imported.forEach((item) => byWord.set(item.word.toLocaleLowerCase("az"), item));
      state.words = Array.from(byWord.values());

      saveWords();
      resetStudySession();
      render();
      showToast(`${imported.length}개 단어를 가져왔습니다.`);
    } catch {
      showToast("가져올 수 없는 파일입니다.");
    }
  });

  reader.readAsText(file);
}

function handleListClick(event) {
  const button = event.target.closest("button");
  const item = event.target.closest(".word-item");
  if (!button || !item) return;

  const action = button.dataset.action;
  const id = item.dataset.id;
  if (action === "edit") editWord(id);
  if (action === "delete") deleteWord(id);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") {
    return;
  }

  const alreadyInstalled = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  const reloadWithNewVersion = () => {
    if (reloading) return;
    reloading = true;
    showToast("새 버전을 적용합니다.");
    setTimeout(() => location.reload(), 350);
  };

  const checkVersion = async () => {
    try {
      const response = await fetch(`./version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return;
      const remote = await response.json();
      if (remote.version && remote.version !== APP_VERSION) {
        reloadWithNewVersion();
      }
    } catch {
      // 오프라인에서는 현재 캐시 버전을 계속 사용합니다.
    }
  };

  if (alreadyInstalled) {
    navigator.serviceWorker.addEventListener("controllerchange", reloadWithNewVersion);
  }

  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
    .then((registration) => {
      const checkForUpdate = () => {
        registration.update().catch(() => {});
        checkVersion();
      };

      checkForUpdate();
      window.addEventListener("focus", checkForUpdate);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          checkForUpdate();
        }
      });
    })
    .catch(() => {});
}

elements.wordForm.addEventListener("submit", upsertWord);
elements.cancelEditButton.addEventListener("click", () => {
  clearForm();
  showToast("수정을 취소했습니다.");
});
elements.wordList.addEventListener("click", handleListClick);
elements.searchInput.addEventListener("input", renderList);
elements.sortSelect.addEventListener("change", () => {
  state.sortMode = elements.sortSelect.value;
  renderList();
});
elements.studyButton.addEventListener("click", pickQuestion);
elements.answerButton.addEventListener("click", showAnswer);
elements.exportButton.addEventListener("click", exportWords);
elements.importButton.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", () => {
  const [file] = elements.fileInput.files;
  if (file) importWords(file);
  elements.fileInput.value = "";
});

loadWords();
render();
registerServiceWorker();



