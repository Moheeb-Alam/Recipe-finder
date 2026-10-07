/* ==========================================================
   Recipe Finder – main JavaScript
   Uses TheMealDB free API (no API key needed):
   https://www.themealdb.com/api.php

   File layout:
     1. Settings & page elements
     2. Small helper functions
     3. API functions (talk to TheMealDB)
     4. Screen-state functions (loading / error / empty / results)
     5. Rendering functions (cards, categories, modal)
     6. Actions (search, category, random, open recipe)
     7. Event listeners & start-up
   ========================================================== */

"use strict";

/* ----------------------------------------------------------
   1. SETTINGS & PAGE ELEMENTS
   ---------------------------------------------------------- */

const API_BASE = "https://www.themealdb.com/api/json/v1/1";
const REQUEST_TIMEOUT_MS = 12000; // give up after 12 seconds

// The home page shows a mix of meals from these searches.
const HOME_SEARCH_TERMS = ["chicken", "beef", "pasta", "cake"];
const HOME_MEAL_LIMIT = 12;

// Shortcut for document.getElementById
const $ = (id) => document.getElementById(id);

const els = {
  searchForm: $("searchForm"),
  searchInput: $("searchInput"),
  randomBtn: $("randomBtn"),
  randomBtnHeader: $("randomBtnHeader"),
  categoryList: $("categoryList"),
  clearFilterBtn: $("clearFilterBtn"),
  resultsTitle: $("resultsTitle"),
  resultsCount: $("resultsCount"),
  loading: $("loading"),
  errorBox: $("errorBox"),
  errorText: $("errorText"),
  retryBtn: $("retryBtn"),
  emptyBox: $("emptyBox"),
  emptyText: $("emptyText"),
  recipeGrid: $("recipeGrid"),
  modal: $("modal"),
  modalPanel: $("modalPanel"),
  modalScroll: $("modalScroll"),
  modalContent: $("modalContent"),
  modalClose: $("modalClose"),
};

// App "memory"
const state = {
  activeCategory: null, // e.g. "Seafood" or null
  lastAction: null, // function we can run again when the user clicks "Try again"
  requestId: 0, // used to ignore outdated responses
  lastFocused: null, // element to focus again after closing the modal
};

// Remember full recipe details so we never download the same meal twice.
const detailsCache = new Map();

/* ----------------------------------------------------------
   2. SMALL HELPER FUNCTIONS
   ---------------------------------------------------------- */

// Protects the page from unsafe text inside API data.
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Only allow normal web links (blocks things like "javascript:...").
function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.href
      : "";
  } catch {
    return "";
  }
}

// Wait a little after the user stops typing before searching.
function debounce(fn, delay = 500) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  debounced.cancel = () => clearTimeout(timer); // stop a waiting search
  return debounced;
}

// Mix up the order of a list (Fisher-Yates shuffle).
function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Turn the 20 ingredient/measure fields into a clean list.
function getIngredients(meal) {
  const list = [];
  for (let i = 1; i <= 20; i++) {
    const name = (meal[`strIngredient${i}`] || "").trim();
    const measure = (meal[`strMeasure${i}`] || "").trim();
    if (name) list.push({ name, measure });
  }
  return list;
}

// Make a readable YouTube link from whatever the API gives us.
function getYoutubeUrl(meal) {
  return safeUrl((meal.strYoutube || "").trim());
}

/* ----------------------------------------------------------
   3. API FUNCTIONS
   ---------------------------------------------------------- */

// Fetch JSON with a timeout and clear error messages.
async function fetchJSON(endpoint) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/${endpoint}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`The recipe server answered with an error (${response.status}).`);
    }
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The request took too long. Please check your connection and try again.");
    }
    if (error instanceof TypeError) {
      throw new Error("Could not reach the recipe server. Please check your internet connection.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// TheMealDB returns { meals: null } when nothing is found.
const toMealArray = (data) => (Array.isArray(data?.meals) ? data.meals : []);

async function searchMeals(query) {
  const data = await fetchJSON(`search.php?s=${encodeURIComponent(query)}`);
  return toMealArray(data);
}

async function fetchCategories() {
  const data = await fetchJSON("categories.php");
  return Array.isArray(data?.categories) ? data.categories : [];
}

async function fetchMealsByCategory(category) {
  const data = await fetchJSON(`filter.php?c=${encodeURIComponent(category)}`);
  return toMealArray(data);
}

async function fetchRandomMeal() {
  const data = await fetchJSON("random.php");
  const meal = toMealArray(data)[0];
  if (meal) detailsCache.set(meal.idMeal, meal);
  return meal || null;
}

// Get full details (ingredients, instructions…) for one meal.
async function fetchMealDetails(id) {
  if (detailsCache.has(id)) return detailsCache.get(id);
  const data = await fetchJSON(`lookup.php?i=${encodeURIComponent(id)}`);
  const meal = toMealArray(data)[0];
  if (!meal) throw new Error("Sorry, this recipe could not be found.");
  detailsCache.set(id, meal);
  return meal;
}

/* ----------------------------------------------------------
   4. SCREEN-STATE FUNCTIONS
   ---------------------------------------------------------- */

// Show only one of: loading, error, empty, results.
function showState(name, message = "") {
  els.loading.classList.toggle("hidden", name !== "loading");
  els.loading.classList.toggle("flex", name === "loading");
  els.errorBox.classList.toggle("hidden", name !== "error");
  els.emptyBox.classList.toggle("hidden", name !== "empty");

  if (name === "error") els.errorText.textContent = message;
  if (name === "empty" && message) els.emptyText.textContent = message;
  if (name !== "results") {
    els.recipeGrid.innerHTML = "";
    els.resultsCount.textContent = "";
  }
}

function setHeading(text) {
  els.resultsTitle.textContent = text;
}

/* ----------------------------------------------------------
   5. RENDERING FUNCTIONS
   ---------------------------------------------------------- */

// ----- Recipe cards -----

function createCardHtml(meal, fallbackCategory) {
  const category = meal.strCategory || fallbackCategory || "";
  const area = meal.strArea || "";

  return `
    <article class="recipe-card" role="button" tabindex="0"
             data-id="${escapeHtml(meal.idMeal)}"
             aria-label="Open recipe for ${escapeHtml(meal.strMeal)}">
      <div class="thumb">
        <img src="${escapeHtml(safeUrl(meal.strMealThumb))}/medium"
             data-full="${escapeHtml(safeUrl(meal.strMealThumb))}"
             alt="${escapeHtml(meal.strMeal)}" loading="lazy" />
      </div>
      <div class="flex flex-1 flex-col gap-3 p-4">
        <h3 class="line-clamp-2 text-lg font-bold leading-snug">${escapeHtml(meal.strMeal)}</h3>
        <div class="mt-auto flex flex-wrap gap-2">
          <span class="badge badge-category category-badge ${category ? "" : "hidden"}">${escapeHtml(category)}</span>
          <span class="badge badge-area area-badge ${area ? "" : "hidden"}">📍 ${escapeHtml(area)}</span>
        </div>
      </div>
    </article>`;
}

function renderCards(meals, fallbackCategory = "") {
  els.recipeGrid.innerHTML = meals
    .map((meal) => createCardHtml(meal, fallbackCategory))
    .join("");

  // Stagger the fade-in animation a little for a smooth feel.
  els.recipeGrid.querySelectorAll(".recipe-card").forEach((card, index) => {
    card.style.animationDelay = `${Math.min(index, 12) * 40}ms`;
  });

  const total = meals.length;
  els.resultsCount.textContent = `${total} recipe${total === 1 ? "" : "s"}`;
}

// Category results from the API only contain name + image.
// This quietly loads the missing "area" for each card in the background.
async function fillMissingCardDetails(meals, requestId) {
  const missing = meals.filter((meal) => !meal.strArea || !meal.strCategory);
  const queue = [...missing];

  async function worker() {
    while (queue.length) {
      const meal = queue.shift();
      if (requestId !== state.requestId) return; // user moved on, stop
      try {
        const full = await fetchMealDetails(meal.idMeal);
        if (requestId !== state.requestId) return;
        const card = els.recipeGrid.querySelector(`[data-id="${CSS.escape(meal.idMeal)}"]`);
        if (!card) continue;

        const areaBadge = card.querySelector(".area-badge");
        if (full.strArea) {
          areaBadge.textContent = `📍 ${full.strArea}`;
          areaBadge.classList.remove("hidden");
        }
        const catBadge = card.querySelector(".category-badge");
        if (full.strCategory) {
          catBadge.textContent = full.strCategory;
          catBadge.classList.remove("hidden");
        }
      } catch {
        // Not important – the card still works without the extra badge.
      }
    }
  }

  // Load a few at a time so we don't flood the API.
  await Promise.all([worker(), worker(), worker(), worker()]);
}

// ----- Category chips -----

function renderCategories(categories) {
  if (!categories.length) {
    els.categoryList.innerHTML =
      '<span class="text-sm text-stone-500">No categories available.</span>';
    return;
  }
  els.categoryList.innerHTML = categories
    .map(
      (cat) => `
      <button type="button" class="chip" data-category="${escapeHtml(cat.strCategory)}"
              aria-pressed="false">${escapeHtml(cat.strCategory)}</button>`
    )
    .join("");
}

function highlightCategory(category) {
  els.categoryList.querySelectorAll(".chip").forEach((chip) => {
    const isActive = chip.dataset.category === category;
    chip.classList.toggle("active", isActive);
    chip.setAttribute("aria-pressed", String(isActive));
  });
  els.clearFilterBtn.classList.toggle("hidden", !category);
}

// ----- Recipe modal -----

function renderModalContent(meal) {
  const ingredients = getIngredients(meal);
  const youtube = getYoutubeUrl(meal);
  const source = safeUrl(meal.strSource || "");
  const image = safeUrl(meal.strMealThumb);

  // Split instructions into paragraphs (one per line).
  const steps = (meal.strInstructions || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const tags = (meal.strTags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return `
    <div class="grid md:grid-cols-5">
      <div class="md:col-span-2">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(meal.strMeal)}"
             class="h-64 w-full object-cover sm:h-80 md:h-full md:min-h-[26rem] md:rounded-bl-[1.25rem] md:rounded-tl-[1.25rem]" />
      </div>

      <div class="p-5 sm:p-8 md:col-span-3">
        <h2 id="modalTitle" class="pr-10 text-2xl font-extrabold leading-tight sm:text-3xl">
          ${escapeHtml(meal.strMeal)}
        </h2>

        <div class="mt-3 flex flex-wrap gap-2">
          ${meal.strCategory ? `<span class="badge badge-category">${escapeHtml(meal.strCategory)}</span>` : ""}
          ${meal.strArea ? `<span class="badge badge-area">📍 ${escapeHtml(meal.strArea)}</span>` : ""}
          ${tags.map((t) => `<span class="badge badge-area">#${escapeHtml(t)}</span>`).join("")}
        </div>

        <div class="mt-5 flex flex-wrap gap-3">
          ${youtube ? `<a class="btn-primary" href="${escapeHtml(youtube)}" target="_blank" rel="noopener noreferrer">▶ Watch on YouTube</a>` : ""}
          ${source ? `<a class="chip" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">🔗 Original source</a>` : ""}
        </div>

        <h3 class="mt-8 text-xl font-bold">Ingredients</h3>
        <ul class="mt-2">
          ${
            ingredients.length
              ? ingredients
                  .map(
                    (item) => `
              <li class="ingredient-item">
                <span class="font-medium">${escapeHtml(item.name)}</span>
                <span class="text-stone-500">${escapeHtml(item.measure)}</span>
              </li>`
                  )
                  .join("")
              : '<li class="text-stone-500">No ingredient list available.</li>'
          }
        </ul>
      </div>
    </div>

    <div class="border-t border-stone-200 p-5 sm:p-8">
      <h3 class="text-xl font-bold">Instructions</h3>
      <div class="instructions mt-3 text-stone-700">
        ${steps.length ? steps.map((s) => `<p>${escapeHtml(s)}</p>`).join("") : "<p>No instructions available.</p>"}
      </div>
    </div>`;
}

function showModalMessage(html) {
  els.modalContent.innerHTML = `<div class="p-10 text-center">${html}</div>`;
}

function openModal() {
  state.lastFocused = document.activeElement;
  els.modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  els.modalScroll.scrollTop = 0;
  els.modalClose.focus();
}

function closeModal() {
  els.modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  els.modalContent.innerHTML = "";
  if (state.lastFocused && document.contains(state.lastFocused)) {
    state.lastFocused.focus();
  }
}

/* ----------------------------------------------------------
   6. ACTIONS
   ---------------------------------------------------------- */

// Runs an action with loading + error handling, and ignores old responses.
async function runAction(action) {
  debouncedSearch.cancel(); // a new action replaces any search still waiting
  state.lastAction = action;
  const requestId = ++state.requestId;
  showState("loading");

  try {
    await action(requestId);
  } catch (error) {
    if (requestId !== state.requestId) return;
    console.error(error);
    showState("error", error.message || "Something unexpected happened.");
  }
}

// Home page: a mix of popular meals.
function loadHome() {
  state.activeCategory = null;
  highlightCategory(null);
  setHeading("Popular picks");

  return runAction(async (requestId) => {
    const results = await Promise.allSettled(
      HOME_SEARCH_TERMS.map((term) => searchMeals(term))
    );
    if (requestId !== state.requestId) return;

    const successful = results.filter((r) => r.status === "fulfilled");
    if (!successful.length) {
      throw results[0].reason; // every request failed → show the error
    }

    // Combine, remove duplicates, mix, and keep a few.
    const unique = new Map();
    successful.flatMap((r) => r.value).forEach((meal) => unique.set(meal.idMeal, meal));
    const meals = shuffle([...unique.values()]).slice(0, HOME_MEAL_LIMIT);

    if (!meals.length) return showState("empty", "No recipes to show right now.");
    showState("results");
    renderCards(meals);
  });
}

// Search by dish name.
function searchByName(query) {
  const term = query.trim();
  if (!term) return loadHome();

  state.activeCategory = null;
  highlightCategory(null);
  setHeading(`Results for “${term}”`);

  return runAction(async (requestId) => {
    const meals = await searchMeals(term);
    if (requestId !== state.requestId) return;

    if (!meals.length) {
      return showState("empty", `We couldn't find any recipe matching “${term}”. Try another dish name.`);
    }
    showState("results");
    renderCards(meals);
  });
}

// Filter by category.
function filterByCategory(category) {
  state.activeCategory = category;
  els.searchInput.value = "";
  highlightCategory(category);
  setHeading(`${category} recipes`);

  return runAction(async (requestId) => {
    const meals = await fetchMealsByCategory(category);
    if (requestId !== state.requestId) return;

    if (!meals.length) {
      return showState("empty", `No recipes found in the “${category}” category.`);
    }
    showState("results");
    renderCards(meals, category);
    fillMissingCardDetails(meals, requestId); // runs in the background
  });
}

// Random meal: show it in the results area and open its full recipe.
function showRandomMeal() {
  state.activeCategory = null;
  els.searchInput.value = "";
  highlightCategory(null);
  setHeading("🎲 Your random meal");

  return runAction(async (requestId) => {
    const meal = await fetchRandomMeal();
    if (requestId !== state.requestId) return;

    if (!meal) throw new Error("No random meal was returned. Please try again.");
    showState("results");
    renderCards([meal]);
    window.scrollTo({ top: 0, behavior: "smooth" });
    openRecipe(meal.idMeal);
  });
}

// Open the detailed recipe modal for one meal.
async function openRecipe(id) {
  openModal();
  showModalMessage('<div class="spinner mx-auto"></div><p class="mt-4 text-stone-500">Loading recipe…</p>');

  try {
    const meal = await fetchMealDetails(id);
    els.modalContent.innerHTML = renderModalContent(meal);
  } catch (error) {
    console.error(error);
    showModalMessage(`
      <div class="text-4xl">⚠️</div>
      <p class="mt-2 font-semibold text-red-700">Could not load this recipe</p>
      <p class="mt-1 text-sm text-red-600">${escapeHtml(error.message)}</p>
      <button type="button" class="btn-primary mt-4" id="modalRetry">Try again</button>`);
    $("modalRetry")?.addEventListener("click", () => openRecipe(id));
  }
}

/* ----------------------------------------------------------
   7. EVENT LISTENERS & START-UP
   ---------------------------------------------------------- */

// Search button / Enter key
els.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchByName(els.searchInput.value);
});

// Search while typing (after a short pause)
const debouncedSearch = debounce(() => {
  const value = els.searchInput.value.trim();
  if (value.length >= 2 || value.length === 0) searchByName(value);
}, 600);
els.searchInput.addEventListener("input", debouncedSearch);

// If a thumbnail is missing in the small size, fall back to the full image.
// (Image "error" events don't bubble, so we listen in the capture phase.)
els.recipeGrid.addEventListener(
  "error",
  (event) => {
    const img = event.target;
    if (img.tagName === "IMG" && img.dataset.full && img.src !== img.dataset.full) {
      img.src = img.dataset.full;
    }
  },
  true
);

// Random buttons
els.randomBtn.addEventListener("click", showRandomMeal);
els.randomBtnHeader.addEventListener("click", showRandomMeal);

// Category chips (one listener for all chips = "event delegation")
els.categoryList.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  const category = chip.dataset.category;
  // Clicking the active chip again clears the filter.
  if (state.activeCategory === category) loadHome();
  else filterByCategory(category);
});

els.clearFilterBtn.addEventListener("click", () => loadHome());

// Retry button in the error box
els.retryBtn.addEventListener("click", () => {
  if (state.lastAction) runAction(state.lastAction);
  else loadHome();
});

// Recipe cards (click or keyboard)
els.recipeGrid.addEventListener("click", (event) => {
  const card = event.target.closest(".recipe-card");
  if (card) openRecipe(card.dataset.id);
});
els.recipeGrid.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest(".recipe-card");
  if (card) {
    event.preventDefault();
    openRecipe(card.dataset.id);
  }
});

// Close the modal: X button, click outside, or Escape key
els.modalClose.addEventListener("click", closeModal);
els.modal.addEventListener("click", (event) => {
  if (event.target === els.modal) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (els.modal.classList.contains("hidden")) return;

  if (event.key === "Escape") {
    closeModal();
    return;
  }

  // Keep keyboard focus inside the open modal (Tab / Shift+Tab loop).
  if (event.key === "Tab") {
    const focusable = els.modalPanel.querySelectorAll("a[href], button");
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

// Start the app
async function init() {
  loadHome();
  try {
    renderCategories(await fetchCategories());
    highlightCategory(state.activeCategory);
  } catch (error) {
    console.error(error);
    els.categoryList.innerHTML =
      '<span class="text-sm text-red-600">Could not load categories. Please refresh the page.</span>';
  }
}

init();
