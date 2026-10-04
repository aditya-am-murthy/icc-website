// Bake Sale Fundraiser data source. NOTION_TOKEN comes from the Netlify environment.
const DATA_SOURCE_ID = "3ef179bb-cbaa-8057-b40a-000b0051e093";
const NOTION_VERSION = "2026-03-11";

const text = (value) => String(value ?? "").trim();

const rich = (value) => {
  const content = text(value).slice(0, 2000);
  return { rich_text: content ? [{ type: "text", text: { content } }] : [] };
};

const asNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function notion(token, method, path, payload) {
  const res = await fetch(`https://api.notion.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: payload == null ? undefined : JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Notion ${res.status}: ${body}`);
  return body ? JSON.parse(body) : {};
}

async function uploadScreenshot(token, file) {
  const filename = (file.name || "payment.png").replace(/[^\w.\-]+/g, "_").slice(0, 80) || "payment.png";
  const contentType = file.type || "image/png";
  const created = await notion(token, "POST", "/v1/file_uploads", {
    mode: "single_part",
    filename,
    content_type: contentType,
  });
  const body = new FormData();
  body.append("file", new Blob([await file.arrayBuffer()], { type: contentType }), filename);
  const sent = await fetch(`https://api.notion.com/v1/file_uploads/${created.id}/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
    },
    body,
  });
  if (!sent.ok) throw new Error(`Notion upload ${sent.status}: ${await sent.text()}`);
  return { id: created.id, name: filename };
}

async function createOrder(token, data, file) {
  const first = text(data.first_name);
  const last = text(data.last_name);
  const name = [first, last].filter(Boolean).join(" ") || text(data.order_id) || "Mithai order";
  const phone = text(data.phone);
  const properties = {
    Name: { title: [{ type: "text", text: { content: name.slice(0, 200) } }] },
    "Order ID": rich(data.order_id),
    "First Name": rich(first),
    "Last Name": rich(last),
    Phone: { phone_number: phone || null },
    "Kaju Katli": { number: asNumber(data.kaju_katli) },
    "Cardamom Shortbread": { number: asNumber(data.cardamom_shortbread) },
    "Order Summary": rich(data.order_summary),
    Total: { number: asNumber(data.estimated_total) },
    "Payment Method": { select: { name: text(data.payment_method) || "Venmo" } },
    Venmo: rich(data.venmo_to),
    Status: { select: { name: "New" } },
  };

  if (file && file.size > 0) {
    const uploaded = await uploadScreenshot(token, file);
    properties["Payment Screenshot"] = {
      files: [{ type: "file_upload", file_upload: { id: uploaded.id }, name: uploaded.name }],
    };
  }

  return notion(token, "POST", "/v1/pages", {
    parent: { type: "data_source_id", data_source_id: DATA_SOURCE_ID },
    properties,
  });
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = process.env.NOTION_TOKEN;
  if (!token) return json({ error: "Orders are not configured yet." }, 500);

  let form;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Could not read the order." }, 400);
  }

  const data = Object.fromEntries(
    [...form.entries()].filter(([, value]) => typeof value === "string")
  );
  if (text(data["bot-field"])) return json({ ok: true });

  const file = form.get("venmo_screenshot");
  try {
    const page = await createOrder(token, data, file);
    return json({ ok: true, id: page.id });
  } catch (error) {
    console.error(error);
    return json({ error: "Could not save the order." }, 502);
  }
};
