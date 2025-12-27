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
const deleteBookBtn = document.getElementById("deleteBook");
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
async function deleteBook(id) {
  const response = await fetch(`/api/books/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const contentType = response.headers.get("Content-Type") || "";
    let message = "";
    if (contentType.includes("application/json")) {
      try {
        const data = await response.json();
        message = data.error || data.message || JSON.stringify(data);
      } catch (error) {
        message = "";
      }
    } else {
      message = await response.text();
    }
    throw new Error(message || "Failed to delete book.");
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
function renderStats() {
  const totalBooks = state.books.length;
  const totalPages = state.books.reduce((sum, book) => sum + (book.totalPages || 0), 0);
  const totalRead = state.books.reduce((sum, book) => sum + (book.pagesRead || 0), 0);
  const progress = totalPages ? totalRead / totalPages : 0;
  statsEl.innerHTML = [
    { label: "Books tracked", value: totalBooks },
    { label: "Pages read", value: totalRead },
    { label: "Collection progress", value: formatPercent(progress) },
  ]
    .map(
      (stat) => `
        <div class="stat">
          <span>${stat.label}</span>
          <strong>${stat.value}</strong>
        </div>
      `
    )
    .join("");
}
function renderTagFilter() {
  if (!tagFilter) return;
  const tags = Array.from(
    new Set(
      state.books
        .flatMap((book) =>
          String(book.tag || "")
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag !== "")
        )
    )
  ).sort((a, b) => a.localeCompare(b));
  const options = ['<option value="all">All tags</option>']
    .concat(tags.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`))
    .join("");
  tagFilter.innerHTML = options;
  if (tags.includes(state.tag)) {
    tagFilter.value = state.tag;
  } else {
    state.tag = "all";
    tagFilter.value = "all";
  }
}
function applyFilters() {
  const query = state.query.toLowerCase();
  let filtered = state.books.filter((book) =>
    book.title.toLowerCase().includes(query) ||
    String(book.tag || "").toLowerCase().includes(query)
  );
  if (state.status !== "all") {
    filtered = filtered.filter((book) => getStatus(book) === state.status);
  }
  if (state.tag !== "all") {
    filtered = filtered.filter((book) =>
      String(book.tag || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== "")
        .includes(state.tag)
    );
  }
  switch (state.sort) {
    case "title":
      filtered.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "progress":
      filtered.sort((a, b) => (getProgress(b) || 0) - (getProgress(a) || 0));
      break;
    case "pages":
      filtered.sort((a, b) => (b.pagesRead || 0) - (a.pagesRead || 0));
      break;
    default:
      filtered.sort((a, b) => (a.id || 0) - (b.id || 0));
      break;
  }
  return filtered;
}
function renderBooks() {
  const filtered = applyFilters();
  resultsCount.textContent = `${filtered.length} of ${state.books.length} shown`;
  bookGrid.innerHTML = filtered
    .map((book, index) => {
      const status = getStatus(book);
      const progress = getProgress(book);
      const progressLabel = progress === null ? "Unknown" : formatPercent(progress);
      const pages =
        typeof book.pagesRead === "number" && typeof book.totalPages === "number"
          ? `${book.pagesRead} of ${book.totalPages} pages`
          : "Page count missing";
      const safeTitle = escapeHtml(book.title);
      const tags = String(book.tag || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== "");
      const tagsMarkup = tags
        .map((tag) => `<span class="book-tag">${escapeHtml(tag)}</span>`)
        .join("");
      const coverMarkup = book.coverPath
        ? `<img src="${book.coverPath}" alt="Cover of ${safeTitle}" loading="lazy">`
        : `<div class="book-cover__placeholder">No cover</div>`;
      return `
        <article class="book-card" data-id="${book.id}" style="animation-delay: ${index * 0.02}s;">
          <div class="book-cover">
            ${coverMarkup}
          </div>
          <div class="status-tag">
            <span class="status-dot" style="background:${statusColors[status]}"></span>
            ${statusLabels[status]}
          </div>
          <h3 class="book-title">${safeTitle}</h3>
          ${tagsMarkup ? `<div class="book-tags">${tagsMarkup}</div>` : ""}
          <div class="book-meta">
            <span>${pages}</span>
            <span>Progress: ${progressLabel}</span>
          </div>
          <div class="progress" aria-hidden="true">
            <span style="width: ${progress === null ? 0 : Math.min(100, Math.round(progress * 100))}%"></span>
          </div>
        </article>
      `;
    })
    .join("");
  bookGrid.querySelectorAll(".book-cover img").forEach((img) => {
    img.addEventListener(
      "error",
      () => {
        const cover = img.closest(".book-cover");
        if (cover) {
          cover.innerHTML = '<div class="book-cover__placeholder">No cover</div>';
        }
      },
      { once: true }
    );
  });
}
function setStatusFilter(button) {
  document.querySelectorAll(".filter").forEach((btn) => btn.classList.remove("active"));
  button.classList.add("active");
  state.status = button.dataset.status;
  renderBooks();
}
function attachEvents() {
  document.getElementById("searchInput").addEventListener("input", (event) => {
    state.query = event.target.value;
    renderBooks();
  });
  document.getElementById("sortSelect").addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderBooks();
  });
  if (tagFilter) {
    tagFilter.addEventListener("change", (event) => {
      state.tag = event.target.value;
      renderBooks();
    });
  }
  document.getElementById("statusFilters").addEventListener("click", (event) => {
    if (event.target.matches(".filter")) {
      setStatusFilter(event.target);
    }
  });
  bookGrid.addEventListener("click", async (event) => {
    if (event.target.matches(".book-title")) {
      const card = event.target.closest(".book-card");
      if (!card) return;
      const id = Number(card.dataset.id);
      const book = state.books.find((item) => item.id === id);
      if (!book) return;
      editForm.dataset.bookId = String(id);
      editTitle.value = book.title || "";
      editTag.value = book.tag || "";
      editCover.value = "";
      editPages.value = typeof book.pagesRead === "number" ? book.pagesRead : "";
      editBackdrop.hidden = false;
    }
  });
  editClose.addEventListener("click", () => {
    editBackdrop.hidden = true;
  });
  editBackdrop.addEventListener("click", (event) => {
    if (event.target === editBackdrop) {
      editBackdrop.hidden = true;
    }
  });
  if (openAddBook) {
    openAddBook.addEventListener("click", () => {
      addBackdrop.hidden = false;
    });
  }
  if (addClose) {
    addClose.addEventListener("click", () => {
      addBackdrop.hidden = true;
    });
  }
  if (addBackdrop) {
    addBackdrop.addEventListener("click", (event) => {
      if (event.target === addBackdrop) {
        addBackdrop.hidden = true;
      }
    });
  }
  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = Number(editForm.dataset.bookId);
    if (!id) return;
    const titleValue = editTitle.value.trim();
    const tagValue = editTag.value.trim();
    const rawValue = editPages.value;
    const coverFile = editCover.files && editCover.files[0];
    if (!titleValue) {
      alert("Title is required.");
      return;
    }
    const pagesRead = rawValue === "" ? null : Number(rawValue);
    if (pagesRead !== null && Number.isNaN(pagesRead)) {
      alert("Pages read must be a number.");
      return;
    }
    if (typeof pagesRead === "number" && pagesRead < 0) {
      alert("Pages read cannot be negative.");
      return;
    }
    try {
      let coverPath = null;
      if (coverFile) {
        try {
          coverPath = await readFileAsDataUrl(coverFile);
        } catch (error) {
          coverPath = null;
        }
      }
      const payload = {
        title: titleValue,
        pagesRead,
        tag: tagValue || null,
      };
      if (coverPath) {
        payload.coverPath = coverPath;
      }
      await updateBookDetails(id, payload);
      const data = await fetchLibrary();
      state.books = data.have || [];
      state.dontHave = data.dontHave || [];
      renderStats();
      renderTagFilter();
      renderBooks();
      renderMissing();
      editBackdrop.hidden = true;
    } catch (error) {
      alert(error.message || "Could not update book details.");
    }
  });
  if (deleteBookBtn) {
    deleteBookBtn.addEventListener("click", async () => {
      const id = Number(editForm.dataset.bookId);
      if (!id) return;
      const titleValue = editTitle.value.trim();
      const confirmed = window.confirm(
        `Delete "${titleValue || "this book"}"? This cannot be undone.`
      );
      if (!confirmed) return;
      try {
        await deleteBook(id);
        const data = await fetchLibrary();
        state.books = data.have || [];
        state.dontHave = data.dontHave || [];
        renderStats();
        renderTagFilter();
        renderBooks();
        renderMissing();
        editBackdrop.hidden = true;
      } catch (error) {
        alert(error.message || "Could not delete the book.");
      }
    });
  }
  const addForm = document.getElementById("addBookForm");
  addForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(addForm);
    const title = String(formData.get("title") || "").trim();
    const pagesReadRaw = formData.get("pagesRead");
    const totalPagesRaw = formData.get("totalPages");
    const tagValue = String(formData.get("tag") || "").trim();
    const coverFile = formData.get("coverFile");
    if (!title) return;
    const pagesRead = pagesReadRaw === "" ? null : Number(pagesReadRaw);
    const totalPages = totalPagesRaw === "" ? null : Number(totalPagesRaw);
    const progress =
      typeof pagesRead === "number" &&
      !Number.isNaN(pagesRead) &&
      typeof totalPages === "number" &&
      totalPages > 0
        ? pagesRead / totalPages
        : null;
    let coverPath = null;
    if (coverFile && coverFile instanceof File && coverFile.size > 0) {
      try {
        coverPath = await readFileAsDataUrl(coverFile);
      } catch (error) {
        coverPath = null;
      }
    }
    const newBook = {
      title,
      pagesRead: Number.isNaN(pagesRead) ? null : pagesRead,
      totalPages: Number.isNaN(totalPages) ? null : totalPages,
      progress,
      coverPath,
      tag: tagValue || null,
    };
    try {
      await createBook(newBook);
      const data = await fetchLibrary();
      state.books = data.have || [];
      state.dontHave = data.dontHave || [];
      addForm.reset();
      renderStats();
      renderTagFilter();
      renderBooks();
      renderMissing();
      if (addBackdrop) {
        addBackdrop.hidden = true;
      }
    } catch (error) {
      alert(error.message || "Could not save the book.");
    }
  });
  if (missingForm && missingInput) {
    missingForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const title = missingInput.value.trim();
      if (!title) return;
      try {
        await createMissingTitle(title);
        const data = await fetchLibrary();
        state.dontHave = data.dontHave || [];
        missingInput.value = "";
        renderMissing();
      } catch (error) {
        alert(error.message || "Could not add missing book.");
      }
    });
  }
  if (missingList) {
    missingList.addEventListener("click", async (event) => {
      if (!event.target.matches("button[data-title]")) return;
      const title = decodeURIComponent(event.target.dataset.title || "");
      try {
        await deleteMissingTitle(title);
        const data = await fetchLibrary();
        state.dontHave = data.dontHave || [];
        renderMissing();
      } catch (error) {
        alert(error.message || "Could not remove missing book.");
      }
    });
  }
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
