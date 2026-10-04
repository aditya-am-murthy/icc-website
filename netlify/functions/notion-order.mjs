const DATA_SOURCE_ID = "3ef179bb-cbaa-8057-b40a-000b0051e093";

const text = (value) => String(value ?? "").trim();

const rich = (value) => {
  const content = text(value).slice(0, 2000);
  return { rich_text: content ? [{ type: "text", text: { content } }] : [] };
};

const asNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const fileUrl = (value) => {
  if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  if (value && typeof value === "object" && typeof value.url === "string") return value.url;
  return "";
};

const submissionData = (event) => {
  if (event?.data && typeof event.data === "object") return event.data;
  if (event?.payload?.data && typeof event.payload.data === "object") return event.payload.data;
  return {};
};

async function createOrder(data) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN is not set");
  if (text(data["bot-field"])) return;

  const formName = text(data["form-name"] || data.form_name);
  if (formName && formName !== "bake-sale-presale") return;

  const first = text(data.first_name);
  const last = text(data.last_name);
  const name = [first, last].filter(Boolean).join(" ") || text(data.order_id) || "Mithai order";
  const phone = text(data.phone);
  const shot = fileUrl(data.venmo_screenshot);

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
  if (shot) properties["Payment Screenshot"] = { url: shot };

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": "2025-09-03",
    },
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: DATA_SOURCE_ID },
      properties,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion ${res.status}: ${body}`);
  }
}

export default {
  async formSubmitted(event) {
    await createOrder(submissionData(event));
  },
};
