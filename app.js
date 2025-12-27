const state = {
  books: [],
  dontHave: [],
  query: "",
  status: "all",
  tag: "all",
  sort: "title",
};

const bookGrid = document.getElementById("bookGrid");
const statsEl = document.getElementById("stats");
const resultsCount = document.getElementById("resultsCount");
const tagFilter = document.getElementById("tagFilter");
const editBackdrop = document.getElementById("editBackdrop");
const editClose = document.getElementById("editClose");
const editForm = document.getElementById("editForm");
const editTitle = document.getElementById("editTitle");
const editTag = document.getElementById("editTag");
const editCover = document.getElementById("editCover");
const editPages = document.getElementById("editPages");
const addBackdrop = document.getElementById("addBackdrop");
const addClose = document.getElementById("addClose");
const openAddBook = document.getElementById("openAddBook");
const pinGate = document.getElementById("pinGate");
const pinForm = document.getElementById("pinForm");
const pinInput = document.getElementById("pinInput");
const pinError = document.getElementById("pinError");
const appContent = document.getElementById("appContent");
const missingList = document.getElementById("missingList");
const missingForm = document.getElementById("missingForm");
const missingInput = document.getElementById("missingInput");

const PIN_CODE = "1234";
const PIN_UNLOCK_KEY = "izzyslibrary:pin-unlocked";

const statusLabels = {
  reading: "Reading",
  finished: "Finished",
  unstarted: "Unstarted",
  unknown: "Unknown",
};

const statusColors = {
  reading: "#ff7a5a",
  finished: "#2a9d8f",
  unstarted: "#f4a261",
  unknown: "#7f4a35",
};

function getStatus(book) {
  const { pagesRead, totalPages } = book;
  if (typeof pagesRead === "number" && typeof totalPages === "number") {
    if (pagesRead >= totalPages) return "finished";
    if (pagesRead > 0) return "reading";
    return "unstarted";
  }
  if (typeof pagesRead === "number" && pagesRead > 0) {
    return "reading";
  }
  return "unknown";
}

function getProgress(book) {
  if (typeof book.progress === "number") return book.progress;
  if (typeof book.pagesRead === "number" && typeof book.totalPages === "number" && book.totalPages) {
    return book.pagesRead / book.totalPages;
  }
  return null;
}

function formatPercent(value) {
  if (value === null || Number.isNaN(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function renderMissing() {
  if (!missingList) return;
  if (!state.dontHave.length) {
    missingList.innerHTML = "<p>No missing books yet.</p>";
    return;
  }
  missingList.innerHTML = state.dontHave
    .map((item) => {
      const rawTitle = String(item.title || "");
      const safeTitle = escapeHtml(rawTitle);
      const encodedTitle = encodeURIComponent(rawTitle);
      return `
        <div class="missing-item">
          <span>${safeTitle}</span>
          <button type="button" data-title="${encodedTitle}">Remove</button>
        </div>
      `;
    })
    .join("");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}




let appStarted = false;

function unlockApp() {
  if (appStarted) return;
  appStarted = true;
  if (pinGate) {
    pinGate.hidden = true;
    pinGate.setAttribute("aria-hidden", "true");
  }
  if (appContent) {
    appContent.removeAttribute("aria-hidden");
  }
  document.body.classList.remove("is-locked");
  init();
}

function lockApp() {
  document.body.classList.add("is-locked");
  if (pinGate) {
    pinGate.hidden = false;
    pinGate.setAttribute("aria-hidden", "false");
  }
  if (appContent) {
    appContent.setAttribute("aria-hidden", "true");
  }
  if (pinInput) {
    pinInput.focus();
  }
}

function setupPinGate() {
  if (!pinGate || !pinForm || !pinInput) {
    unlockApp();
    return;
  }

  const unlocked = localStorage.getItem(PIN_UNLOCK_KEY) === "true";
  if (unlocked) {
    unlockApp();
    return;
  }

  lockApp();

  pinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = pinInput.value.trim();
    if (value === PIN_CODE) {
      localStorage.setItem(PIN_UNLOCK_KEY, "true");
      if (pinError) pinError.textContent = "";
      unlockApp();
      return;
    }
    if (pinError) {
      pinError.textContent = "Incorrect PIN. Try again.";
    }
    pinInput.value = "";
    pinInput.focus();
  });

  pinInput.addEventListener("input", () => {
    if (pinError && pinError.textContent) {
      pinError.textContent = "";
    }
  });
}

async function fetchLibrary() {

  const response = await fetch("/api/books");

  if (response.ok) {

    return response.json();

  }



  const fallback = await fetch("data/books.json");

  if (!fallback.ok) {

    return { have: [], dontHave: [] };

  }

  return fallback.json();

}



async function createBook(book) {

  const response = await fetch("/api/books", {

    method: "POST",

    headers: {

      "Content-Type": "application/json",

    },

    body: JSON.stringify(book),

  });

  if (!response.ok) {

    const message = await response.text();

    throw new Error(message || "Failed to save book.");

  }

  return response.json();

}



async function updateBookDetails(id, payload) {

  const response = await fetch(`/api/books/${id}`, {

    method: "PUT",

    headers: {

      "Content-Type": "application/json",

    },

    body: JSON.stringify(payload),

  });

  if (!response.ok) {

    const message = await response.text();

    throw new Error(message || "Failed to update book.");

  }

  return response.json();

}



async function createMissingTitle(title) {

  if (!title) return;

  const response = await fetch("/api/missing", {

    method: "POST",

    headers: {

      "Content-Type": "application/json",

    },

    body: JSON.stringify({ title }),

  });

  if (!response.ok) {

    const message = await response.text();

    throw new Error(message || "Failed to add missing book.");

  }

  return response.json();

}



async function deleteMissingTitle(title) {

  if (!title) return;

  const response = await fetch(`/api/missing?title=${encodeURIComponent(title)}`, {

    method: "DELETE",

  });

  if (!response.ok) {

    const message = await response.text();

    throw new Error(message || "Failed to remove missing book.");

  }

  return response.json();

}



async function init() {
  try {
    const data = await fetchLibrary();
    state.books = data.have || [];
    state.dontHave = data.dontHave || [];
  } catch (error) {
    state.books = [];
    state.dontHave = [];
    alert("Could not load library data.");
  }

  renderStats();
  renderTagFilter();
  renderBooks();
  renderMissing();
  attachEvents();

  const sortSelect = document.getElementById("sortSelect");
  if (sortSelect) {
    sortSelect.value = "title";
  }
}

setupPinGate();
