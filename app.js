/* =========================================================
   CONFIG: edit these values to personalise the site
   ========================================================= */
const CONFIG = {
  // Your GitHub username (projects are loaded from this account)
  githubUsername: "Yusuf011-4023",

  // Your LinkedIn profile URL
  linkedinUrl: "https://www.linkedin.com/in/yusuf-aslam-77728322a/",

  // Optional: your contact email. Leave "" to hide it.
  email: "",

  // Repos to show first, in this order, marked "Pinned".
  // Use the exact repo names, e.g. ["LogisticsShippinhRates"]
  pinnedRepos: [],

  // Repos to hide from the site (forked repos are always hidden)
  excludeRepos: ["testrepo"],

  // Hide the special "username/username" profile README repo if you make one
  hideProfileReadme: true,

  // How long to remember GitHub's response, to stay under the API limit
  // (60 requests per hour per visitor)
  cacheMinutes: 15,
};

(function () {
  "use strict";

  document.documentElement.classList.add("js");

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const compactMQ = matchMedia("(max-width: 860px)");
  const API_URL = `https://api.github.com/users/${encodeURIComponent(CONFIG.githubUsername)}/repos?per_page=100&sort=pushed`;
  const CACHE_KEY = `portfolio-repos-v2:${CONFIG.githubUsername}`;

  const rail = document.getElementById("rail");
  let engine = null;   // the ScrollCraft instance, once mounted
  let parts = [];      // every drafted part on the page

  /* ---------- Small helpers ---------- */

  // Make text safe to put inside HTML
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  // Only allow http(s) links for live demos; add https:// if it's missing
  function safeUrl(url) {
    if (!url || !url.trim()) return null;
    let value = url.trim();
    if (!/^https?:\/\//i.test(value)) value = "https://" + value;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
    } catch {
      return null;
    }
  }

  const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  function timeAgo(dateString) {
    const seconds = (new Date(dateString) - Date.now()) / 1000;
    const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
    for (const [unit, size] of units) {
      if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
    }
    return "just now";
  }

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const phase = (x, a, b) => clamp01((x - a) / (b - a));
  const pad2 = (n) => String(n).padStart(2, "0");
  const f = (n) => n.toFixed(1);

  /* ---------- Links in the header, sheets and close ---------- */
  function setLinks() {
    const links = {
      github: `https://github.com/${CONFIG.githubUsername}`,
      linkedin: CONFIG.linkedinUrl,
      email: CONFIG.email ? `mailto:${CONFIG.email}` : "",
    };
    document.querySelectorAll("[data-link]").forEach((el) => {
      const href = links[el.dataset.link];
      if (href) el.href = href;
    });
    const emailRow = document.querySelector('[data-link-row="email"]');
    if (emailRow) emailRow.hidden = !CONFIG.email;
    document.getElementById("year").textContent = new Date().getFullYear();
  }

  /* ---------- Caching (so refreshing doesn't use up the API limit) ---------- */
  function readCache(allowExpired = false) {
    try {
      const saved = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (!saved || !Array.isArray(saved.repos)) return null;
      const expired = Date.now() - saved.time > CONFIG.cacheMinutes * 60 * 1000;
      return expired && !allowExpired ? null : saved.repos;
    } catch {
      return null;
    }
  }

  function writeCache(repos) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), repos }));
    } catch {
      // Storage unavailable (e.g. private browsing): the site still works without it
    }
  }

  /* ---------- Fetch repos from GitHub ---------- */
  async function fetchRepos() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(API_URL, {
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`GitHub API responded with ${response.status}`);
        error.status = response.status;
        if ((response.status === 403 || response.status === 429) && response.headers.get("x-ratelimit-remaining") === "0") {
          error.rateLimited = true;
          const reset = Number(response.headers.get("x-ratelimit-reset"));
          if (reset) error.resetAt = new Date(reset * 1000);
        }
        throw error;
      }
      const data = await response.json();
      // Keep only the fields the site uses
      return data.map((repo) => ({
        name: repo.name,
        description: repo.description,
        language: repo.language,
        stars: repo.stargazers_count,
        size: repo.size,                                   // in KB, as GitHub reports it
        url: repo.html_url,
        homepage: repo.homepage,
        fork: repo.fork,
        created: repo.created_at,
        updated: repo.pushed_at || repo.updated_at,        // last time code was pushed
      }));
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- Filter and sort: pinned first, then most recently updated ---------- */
  function prepareRepos(repos) {
    const pinned = CONFIG.pinnedRepos.map((name) => name.toLowerCase());
    const excluded = new Set(CONFIG.excludeRepos.map((name) => name.toLowerCase()));
    if (CONFIG.hideProfileReadme) excluded.add(CONFIG.githubUsername.toLowerCase());

    return repos
      .filter((repo) => !repo.fork && !excluded.has(repo.name.toLowerCase()))
      .map((repo) => ({ ...repo, pinnedIndex: pinned.indexOf(repo.name.toLowerCase()) }))
      .sort((a, b) => {
        const aPinned = a.pinnedIndex !== -1;
        const bPinned = b.pinnedIndex !== -1;
        if (aPinned && bPinned) return a.pinnedIndex - b.pinnedIndex;
        if (aPinned !== bPinned) return aPinned ? -1 : 1;
        return new Date(b.updated) - new Date(a.updated);
      });
  }

  /* =========================================================
     THE DRAFTED PART (the signature move)
     Each repo becomes a machined plate whose dimensions are its
     real stats: width from days active, height from size in KB,
     one drilled hole per star. Scrolling drafts it line by line.
     ========================================================= */
  function partSvg(repo, compact) {
    // Desktop sheets are nearly square, phones are wide and short
    const W = compact ? 380 : 480, H = compact ? 300 : 380;
    const L = 78, R = 26, T = 78, B = 70;
    const days = Math.max(0, Math.round((new Date(repo.updated) - new Date(repo.created)) / 86400000));
    const kb = Math.max(0, repo.size || 0);
    const stars = Math.max(0, repo.stars || 0);
    const language = (repo.language || "Unspecified").slice(0, 16);

    const nd = Math.min(1, Math.log1p(days) / Math.log1p(365));
    const nk = Math.min(1, Math.log1p(kb) / Math.log1p(10000));
    const availW = W - L - R, availH = H - T - B;
    const pw = availW * (0.62 + 0.38 * nd);
    const ph = availH * (0.5 + 0.5 * nk);
    const x0 = L + (availW - pw) / 2, y0 = T + (availH - ph) / 2;
    const x1 = x0 + pw, y1 = y0 + ph, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, c = 10;

    // Outline with chamfered corners, plus an inner pocket
    const outline = `M${f(x0 + c)} ${f(y0)}H${f(x1 - c)}L${f(x1)} ${f(y0 + c)}V${f(y1 - c)}L${f(x1 - c)} ${f(y1)}H${f(x0 + c)}L${f(x0)} ${f(y1 - c)}V${f(y0 + c)}Z`;
    const inset = 14;
    const pocket = ph > 70
      ? `<rect class="ln ink-soft" pathLength="1" x="${f(x0 + inset)}" y="${f(y0 + inset)}" width="${f(pw - inset * 2)}" height="${f(ph - inset * 2)}" rx="3"/>`
      : "";

    // Mounting holes in the corners, and one drilled hole per star along the centre line
    const corner = [[x0 + 16, y0 + 16], [x1 - 16, y0 + 16], [x0 + 16, y1 - 16], [x1 - 16, y1 - 16]]
      .map(([x, y]) => `<circle class="hole" cx="${f(x)}" cy="${f(y)}" r="4"/>`).join("");
    const k = Math.min(stars, 7);
    const span = Math.max(pw - 90, 0);
    const starHoles = Array.from({ length: k }, (_, i) => {
      const x = k === 1 ? cx : x0 + 45 + span * (i / (k - 1));
      return `<circle class="hole" cx="${f(x)}" cy="${f(cy)}" r="6.5"/>`;
    }).join("");

    const arrow = (x, y, dir) => {
      // dir: "l" "r" "u" "d" (which way the arrow points)
      const s = 7, w = 3;
      const p = {
        l: `M${f(x)} ${f(y)}l${s} ${-w}v${w * 2}z`,
        r: `M${f(x)} ${f(y)}l${-s} ${-w}v${w * 2}z`,
        u: `M${f(x)} ${f(y)}l${-w} ${s}h${w * 2}z`,
        d: `M${f(x)} ${f(y)}l${-w} ${-s}h${w * 2}z`,
      }[dir];
      return `<path class="arrow" d="${p}"/>`;
    };

    const dy = y1 + 34;   // horizontal dimension line (days)
    const dx = x0 - 34;   // vertical dimension line (size)
    const label = `Drawing of ${repo.name}: ${days} ${days === 1 ? "day" : "days"} from creation to latest push, ${kb} KB, written in ${language}, ${stars} ${stars === 1 ? "star" : "stars"}.`;

    return `
      <svg class="part" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(label)}" preserveAspectRatio="xMidYMid meet">
        <g data-ph="outline">
          <path class="ln ink" pathLength="1" d="${outline}"/>
          ${pocket}
        </g>
        <g data-ph="construction">
          <path class="centre" d="M${f(x0 - 14)} ${f(cy)}H${f(x1 + 14)}M${f(cx)} ${f(y0 - 14)}V${f(y1 + 14)}"/>
          ${corner}${starHoles}
        </g>
        <g data-ph="dims">
          <path class="ln red" pathLength="1" d="M${f(x0)} ${f(y1 + 8)}V${f(dy + 8)}M${f(x1)} ${f(y1 + 8)}V${f(dy + 8)}M${f(x0)} ${f(dy)}H${f(x1)}"/>
          <path class="ln red" pathLength="1" d="M${f(x0 - 8)} ${f(y0)}H${f(dx - 8)}M${f(x0 - 8)} ${f(y1)}H${f(dx - 8)}M${f(dx)} ${f(y0)}V${f(y1)}"/>
          <g data-fade>
            ${arrow(x0, dy, "l")}${arrow(x1, dy, "r")}${arrow(dx, y0, "u")}${arrow(dx, y1, "d")}
            <text class="dim-text" x="${f(cx)}" y="${f(dy - 7)}" text-anchor="middle"><tspan data-to="${days}">${days}</tspan> ${days === 1 ? "day" : "days"} active</text>
            <text class="dim-text" transform="translate(${f(dx - 8)} ${f(cy)}) rotate(-90)" text-anchor="middle"><tspan data-to="${kb}">${kb}</tspan> KB</text>
          </g>
        </g>
        <g data-ph="callouts">
          <path class="ln ink-soft" pathLength="1" d="M${f(x1 - 24)} ${f(y0 + 22)}L${f(x1 - 4)} ${f(y0 - 24)}H${f(x1 + 6)}"/>
          <path class="ln ink-soft" pathLength="1" d="M${f(k ? (k === 1 ? cx : x0 + 45) : x0 + 24)} ${f(k ? cy : y0 + 22)}L${f(x0 + 6)} ${f(y0 - 24)}H${f(x0 - 6)}"/>
          <g data-fade>
            <circle class="arrow" cx="${f(x1 - 24)}" cy="${f(y0 + 22)}" r="2.2"/>
            <circle class="arrow" cx="${f(k ? (k === 1 ? cx : x0 + 45) : x0 + 24)}" cy="${f(k ? cy : y0 + 22)}" r="2.2"/>
            <text x="${f(x1 + 6)}" y="${f(y0 - 32)}" text-anchor="end">${escapeHtml(language)}</text>
            <text x="${f(x0 - 6)}" y="${f(y0 - 32)}" text-anchor="start"><tspan data-to="${stars}">${stars}</tspan> ${stars === 1 ? "star" : "stars"}</text>
          </g>
        </g>
      </svg>`;
  }

  /* ---------- One sheet per project ---------- */
  function sheetHtml(repo, no) {
    const demo = safeUrl(repo.homepage);
    const pinned = repo.pinnedIndex !== -1;
    const status = `${pinned ? "Pinned. " : ""}Revised ${timeAgo(repo.updated)}`;
    return `
      <article class="sheet${pinned ? " is-pinned" : ""}" id="obj-${pad2(no)}" data-part aria-labelledby="t-${pad2(no)}">
        <div class="sheet__draw" data-draw></div>
        <div class="tb">
          <p class="tb__no">No. ${pad2(no)}</p>
          <h2 class="tb__title" id="t-${pad2(no)}">${escapeHtml(repo.name)}</h2>
          <dl class="tb__rows">
            <div><dt>Material</dt><dd>${escapeHtml(repo.language || "Not specified")}</dd></div>
            <div><dt>Status</dt><dd>${escapeHtml(status)}</dd></div>
            <div><dt>Note</dt><dd class="tb__note${repo.description ? "" : " is-empty"}">${escapeHtml(repo.description || "No description yet.")}</dd></div>
          </dl>
          <p class="tb__links">
            <a class="btn btn--solid" href="${escapeHtml(repo.url)}" target="_blank" rel="noopener noreferrer">View on GitHub</a>
            ${demo ? `<a class="btn btn--line" href="${escapeHtml(demo)}" target="_blank" rel="noopener noreferrer">Live demo</a>` : ""}
          </p>
        </div>
      </article>`;
  }

  function problemSheet(title, message) {
    return `
      <article class="sheet" id="obj-01">
        <div class="sheet__draw"><p class="sheet__status"><strong>${escapeHtml(title)}</strong>${escapeHtml(message)}</p></div>
        <div class="tb">
          <p class="tb__no">No. 01</p>
          <p class="tb__title">Collection unavailable</p>
          <p class="tb__links"><a class="btn btn--solid" href="https://github.com/${escapeHtml(CONFIG.githubUsername)}" target="_blank" rel="noopener noreferrer">GitHub profile</a></p>
        </div>
      </article>`;
  }

  function errorMessage(error) {
    if (error && error.rateLimited) {
      const when = error.resetAt ? ` after ${error.resetAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : " in a little while";
      return ["Taking a quick break", `GitHub limits how often projects can be loaded. Please try again${when}, or browse my work on GitHub directly.`];
    }
    if (error && error.status === 404) {
      return ["Projects not found", `Couldn't find the GitHub user "${CONFIG.githubUsername}". Check githubUsername in app.js.`];
    }
    return ["Couldn't reach GitHub", "Something went wrong loading my projects. Refresh to try again, or view them on GitHub."];
  }

  /* ---------- Build the collection, then start the scroll engine ---------- */
  function renderCollection(repos, error) {
    document.getElementById("obj-loading").remove();

    let html = "";
    if (error) {
      const [title, message] = errorMessage(error);
      html += problemSheet(title, message);
    } else if (!repos.length) {
      html += problemSheet("Projects coming soon", "There aren't any public projects to show yet. Check back soon.");
    } else {
      repos.forEach((repo, i) => { html += sheetHtml(repo, i + 1); });
    }
    html += `
      <aside class="rail-end">
        <p class="sc-label">End of collection</p>
        <p class="rail-end__text">That's everything so far. New public repos appear here on their own.</p>
      </aside>`;
    rail.insertAdjacentHTML("beforeend", html);

    parts = [];
    rail.querySelectorAll("[data-part]").forEach((sheet, i) => {
      parts.push({ sheet, repo: repos[i], draw: sheet.querySelector("[data-draw]"), groups: null, nums: [], last: -1 });
    });
    drawParts();

    document.getElementById("plate-no").textContent = `No. ${pad2(rail.querySelectorAll(".sheet").length)} · Enquiries`;
    buildIndex();

    engine = window.ScrollCraft.mount(document.body);
    update();
  }

  // (Re)draw every part for the current screen size
  function drawParts() {
    const compact = compactMQ.matches;
    parts.forEach((part) => {
      part.draw.innerHTML = partSvg(part.repo, compact);
      const svg = part.draw.firstElementChild;
      part.groups = {
        outline: svg.querySelector('[data-ph="outline"]'),
        construction: svg.querySelector('[data-ph="construction"]'),
        dims: svg.querySelector('[data-ph="dims"]'),
        callouts: svg.querySelector('[data-ph="callouts"]'),
      };
      part.nums = Array.from(svg.querySelectorAll("tspan[data-to]")).map((el) => ({ el, to: Number(el.dataset.to) }));
      part.last = -1;
    });
  }

  /* ---------- Drafting: scroll is the pencil ---------- */
  function draftAmount(part) {
    if (reduce) return 1;
    // 0 when the middle of the drawing comes up into view at the bottom of the screen,
    // 1 when the middle of the whole sheet reaches the middle of the screen
    const sheet = part.sheet.getBoundingClientRect();
    const draw = part.draw.firstElementChild.getBoundingClientRect();
    const drawMid = draw.top + draw.height / 2;
    const sheetMid = sheet.top + sheet.height / 2;
    const travelled = innerHeight * 0.95 - drawMid;
    const total = innerHeight * 0.95 - innerHeight / 2 + (sheetMid - drawMid);
    return clamp01(travelled / Math.max(total, 1));
  }

  // Lines draw themselves (their dash offset is inherited from the group);
  // arrows, holes and text fade in once their lines have mostly landed
  function setPhase(group, amount, mode) {
    if (mode === "fade") {
      group.style.opacity = amount.toFixed(3);
      return;
    }
    group.style.strokeDashoffset = (1 - amount).toFixed(4);
    const fade = group.querySelector("[data-fade]");
    if (fade) fade.style.opacity = phase(amount, 0.55, 1).toFixed(3);
  }

  function update() {
    parts.forEach((part) => {
      const d = draftAmount(part);
      if (Math.abs(d - part.last) < 0.002) return;
      part.last = d;
      const o = phase(d, 0, 0.45), c = phase(d, 0.3, 0.6), m = phase(d, 0.5, 0.82), t = phase(d, 0.68, 0.96);
      setPhase(part.groups.outline, o);
      setPhase(part.groups.construction, c, "fade");
      setPhase(part.groups.dims, m);
      setPhase(part.groups.callouts, t);
      // The numbers count up as their dimension lines land
      part.nums.forEach((n, i) => {
        const amount = i < 2 ? phase(m, 0.55, 1) : phase(t, 0.55, 1);
        n.el.textContent = Math.round(n.to * amount);
      });
    });
  }

  let ticking = false;
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { update(); ticking = false; });
  }, { passive: true });

  /* ---------- Object 00: lettering guides measured from the real font ---------- */
  function placeGuides() {
    const lines = document.querySelectorAll(".letter__line");
    if (!lines.length) return;
    lines.forEach((line) => line.querySelector(".guides")?.remove());

    const style = getComputedStyle(lines[0]);
    const size = parseFloat(style.fontSize);
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
    const mH = ctx.measureText("H");
    if (!("fontBoundingBoxAscent" in mH)) return;   // older browser: skip the guides

    const A = mH.fontBoundingBoxAscent, D = mH.fontBoundingBoxDescent;
    const cap = mH.actualBoundingBoxAscent;
    const xh = ctx.measureText("x").actualBoundingBoxAscent;

    lines.forEach((line, li) => {
      const lh = line.getBoundingClientRect().height;
      const base = (lh - (A + D)) / 2 + A;
      const rules = [
        { y: base - cap, name: "cap height" },
        { y: base - xh, name: "x-height", cls: "guide--x" },
        { y: base, name: "baseline" },
      ];
      const wrap = document.createElement("span");
      wrap.className = "guides";
      wrap.setAttribute("aria-hidden", "true");
      rules.forEach((r, i) => {
        const g = document.createElement("i");
        g.className = `guide ${r.cls || ""}`;
        g.style.top = `${r.y.toFixed(1)}px`;
        g.style.setProperty("--i", li * 3 + i);
        if (li === 0) {
          const s = document.createElement("span");
          s.textContent = r.name;
          g.appendChild(s);
        }
        wrap.appendChild(g);
      });
      line.prepend(wrap);
    });
    document.getElementById("letter-name").classList.add("is-lettered");
  }

  /* ---------- Index: jump to any object ---------- */
  function buildIndex() {
    const list = document.getElementById("index-list");
    const items = Array.from(rail.querySelectorAll(".sheet")).map((sheet, i) => {
      const title = sheet.querySelector(".tb__title")?.textContent.trim() || "";
      return `<li><a href="#${sheet.id}" data-jump="${sheet.id}"><span class="index__no">${pad2(i)}</span><span>${escapeHtml(title)}</span></a></li>`;
    });
    items.push(`<li><a href="#contact" data-jump="contact"><span class="index__no">${pad2(items.length)}</span><span>Let's talk</span></a></li>`);
    list.innerHTML = items.join("");
  }

  // Scroll so the object sits just below the fixed header
  function jumpTo(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const offset = el.id === "contact" ? 0 : document.querySelector(".bar").offsetHeight + 16;
    scrollTo({ top: el.getBoundingClientRect().top + scrollY - offset, behavior: reduce ? "instant" : "smooth" });
  }

  const toggle = document.getElementById("index-toggle");
  const panel = document.getElementById("index-panel");
  function setIndex(open) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) panel.querySelector("a")?.focus();
  }
  toggle.addEventListener("click", () => setIndex(panel.hidden));
  panel.addEventListener("click", (e) => {
    const link = e.target.closest("[data-jump]");
    if (!link) return;
    e.preventDefault();
    setIndex(false);
    toggle.focus({ preventScroll: true });
    jumpTo(link.dataset.jump);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) { setIndex(false); toggle.focus(); }
  });
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !toggle.contains(e.target)) setIndex(false);
  });

  // Redraw the parts when switching between phone and desktop layouts
  compactMQ.addEventListener("change", () => { drawParts(); update(); });
  addEventListener("resize", () => { placeGuides(); update(); }, { passive: true });

  /* ---------- Start ---------- */
  async function start() {
    setLinks();
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(placeGuides);

    const cached = readCache();
    if (cached) { renderCollection(prepareRepos(cached)); return; }
    try {
      const repos = await fetchRepos();
      writeCache(repos);
      renderCollection(prepareRepos(repos));
    } catch (error) {
      console.error("Could not load GitHub repos:", error);
      const saved = readCache(true);   // fall back to the last saved results
      if (saved) renderCollection(prepareRepos(saved));
      else renderCollection([], error);
    }
  }

  start();
})();
