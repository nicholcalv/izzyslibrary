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
const missingList = document.getElementById("missingList");
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
      return `
        <div class="missing-item">
          <span>${safeTitle}</span>
        </div>
      `;
    })
    .join("");
}
async function fetchLibrary() {
  const response = await fetch("data/books.json");
  if (!response.ok) {
    return { have: [], dontHave: [] };
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
init();
