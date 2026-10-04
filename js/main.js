document.documentElement.classList.add("js");

// Mobile nav
const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector(".nav");
if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open);
  });
}

// Mark current page in nav
const here = (location.pathname.split("/").pop() || "index").replace(/\.html$/, "") || "index";
document.querySelectorAll(".nav a").forEach((a) => {
  const href = (a.getAttribute("href") || "").split("/").pop().replace(/\.html$/, "");
  if (href === here) a.setAttribute("aria-current", "page");
});

// Reveal on scroll
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
  { threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// Footer year
document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

// Board headshots: try common extensions, then leave the painted frame.
document.querySelectorAll(".member-photo img").forEach((img) => {
  const stem = img.getAttribute("src").replace(/\.[^.]+$/, "");
  const sources = [...new Set([img.getAttribute("src"), ...[".jpg", ".jpeg", ".png", ".webp"].map((ext) => stem + ext)])];
  let attempt = 0;
  const tryNext = () => {
    attempt += 1;
    if (attempt < sources.length) img.src = sources[attempt];
    else img.remove();
  };
  img.addEventListener("error", tryNext);
  if (img.complete && img.naturalWidth === 0) tryNext();
});

// ---------- Bake sale pre-order ----------
// Price is dollars per 4-count box. null shows "Price TBA" and excludes the item from the total.
const PRICES = {
  kaju_katli: 2,
  cardamom_shortbread: 2,
};
const ITEM_NAMES = {
  kaju_katli: "Kaju Katli",
  cardamom_shortbread: "Cardamom Shortbread",
};

const orderForm = document.querySelector("#presale-form");
if (orderForm) {
  const fmt = (n) => `$${n.toFixed(2)}`;
  const totalEl = orderForm.querySelector("[data-total]");
  const totalField = orderForm.querySelector("input[name='estimated_total']");
  const qtyOf = (key) => parseInt(orderForm.querySelector(`input[name='${key}']`).value, 10) || 0;

  orderForm.querySelectorAll("[data-price-for]").forEach((el) => {
    const p = PRICES[el.dataset.priceFor];
    el.textContent = p == null ? "Price TBA" : `$${p % 1 ? p.toFixed(2) : p} / 4 ct`;
  });

  const recalc = () => {
    let total = 0;
    for (const [key, price] of Object.entries(PRICES)) {
      if (price != null) total += qtyOf(key) * price;
    }
    totalEl.textContent = fmt(total);
    totalField.value = total.toFixed(2);
    return total;
  };

  orderForm.querySelectorAll(".qty").forEach((q) => {
    const input = q.querySelector("input");
    q.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        const next = (parseInt(input.value, 10) || 0) + Number(b.dataset.step);
        input.value = Math.max(0, Math.min(50, next));
        recalc();
      })
    );
  });
  orderForm.addEventListener("input", recalc);
  recalc();

  const makeOrderId = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return "ICC-" + [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
  };

  const showConfirmation = ({ id, name, items, total, preview }) => {
    const panel = document.querySelector("#order-confirm");
    panel.querySelector("[data-confirm='id']").textContent = id;
    panel.querySelector("[data-confirm='name']").textContent = name;
    const list = panel.querySelector("[data-confirm='items']");
    list.replaceChildren();
    items.forEach((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      list.appendChild(li);
    });
    panel.querySelector("[data-confirm='total']").textContent = total;
    panel.querySelector("[data-preview]").classList.toggle("hidden", !preview);
    orderForm.classList.add("hidden");
    panel.classList.remove("hidden");
    panel.hidden = false;
    panel.removeAttribute("aria-hidden");
    panel.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  orderForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = orderForm.querySelector("[data-error]");
    const submitErr = orderForm.querySelector("[data-submit-error]");
    const lines = [];
    let count = 0;
    for (const [key, price] of Object.entries(PRICES)) {
      const qty = qtyOf(key);
      count += qty;
      if (qty > 0 && price != null) {
        lines.push(`${qty} × ${ITEM_NAMES[key]} (4 ct) — ${fmt(qty * price)}`);
      }
    }
    if (count === 0) {
      err.classList.remove("hidden");
      err.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    err.classList.add("hidden");
    submitErr.classList.add("hidden");

    const total = recalc();
    const orderId = makeOrderId();
    const name = ["first_name", "last_name"]
      .map((n) => orderForm.querySelector(`[name='${n}']`).value.trim())
      .filter(Boolean)
      .join(" ");
    orderForm.querySelector("input[name='order_id']").value = orderId;
    orderForm.querySelector("input[name='order_summary']").value = lines.join("; ");

    const button = orderForm.querySelector("[type='submit']");
    button.disabled = true;
    const label = button.textContent;
    button.textContent = "Sending…";

    let ok = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch("/api/order", { method: "POST", body: new FormData(orderForm), signal: ctrl.signal });
      ok = res.ok;
    } catch (_) {
      ok = false;
    } finally {
      clearTimeout(timer);
    }

    const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (ok || local) {
      showConfirmation({ id: orderId, name, items: lines, total: fmt(total), preview: !ok && local });
      return;
    }

    button.disabled = false;
    button.textContent = label;
    submitErr.classList.remove("hidden");
    submitErr.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}
