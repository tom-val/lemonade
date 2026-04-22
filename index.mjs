import { DynamoDBClient, PutItemCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import { randomUUID } from "node:crypto";

const TABLE_NAME = "lemonade-registrations";
const client = new DynamoDBClient({ region: "eu-west-1" });

export const handler = async (event) => {
  const method = event.requestContext?.http?.method ?? event.httpMethod ?? "GET";

  const path = event.rawPath ?? event.path ?? "/";

  if (method === "POST") {
    return handlePost(event);
  }

  if (path === "/registrations") {
    return handleRegistrations();
  }

  return {
    statusCode: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: getHtml(),
  };
};

async function handlePost(event) {
  const headers = { "content-type": "application/json; charset=utf-8" };

  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Netinkamas užklausos formatas." }) };
  }

  const name = (body.name ?? "").trim();
  const role = body.role;

  if (!name) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Prašome įvesti vardą." }) };
  }

  const validRoles = ["participant", "judge", "any"];
  if (!validRoles.includes(role)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Prašome pasirinkti vaidmenį." }) };
  }

  const fingerprint = (body.fingerprint ?? "").trim();

  try {
    await client.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: {
          id: { S: randomUUID() },
          fingerprint: { S: fingerprint },
          name: { S: name },
          role: { S: role },
          registeredAt: { S: new Date().toISOString() },
        },
      })
    );

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error("[Registration] DynamoDB put failed:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Įvyko klaida. Bandykite dar kartą." }) };
  }
}

const ROLE_LABELS = { participant: "Dalyvis", judge: "Teisėjas", any: "Nesvarbu" };

async function handleRegistrations() {
  try {
    const data = await client.send(new ScanCommand({ TableName: TABLE_NAME }));
    const items = (data.Items ?? [])
      .map((item) => ({
        name: item.name?.S ?? "",
        role: ROLE_LABELS[item.role?.S] ?? item.role?.S ?? "",
        registeredAt: item.registeredAt?.S ?? "",
        fingerprint: (item.fingerprint?.S ?? "").slice(0, 8),
      }))
      .sort((a, b) => a.registeredAt.localeCompare(b.registeredAt));

    return {
      statusCode: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: getRegistrationsHtml(items),
    };
  } catch (err) {
    console.error("[Registrations] DynamoDB scan failed:", err);
    return {
      statusCode: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: "Klaida gaunant registracijas.",
    };
  }
}

function getRegistrationsHtml(items) {
  const rows = items
    .map(
      (item, i) =>
        `<tr><td>${i + 1}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.role)}</td><td>${formatDate(item.registeredAt)}</td><td><code>${escapeHtml(item.fingerprint)}</code></td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="lt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Registracijos</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #fef9e7 0%, #eafaf1 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      padding: 2rem 1rem;
    }
    .container { max-width: 640px; width: 100%; }
    h1 { text-align: center; color: #2c3e50; font-size: 1.5rem; margin-bottom: 0.5rem; }
    .count { text-align: center; color: #888; margin-bottom: 1.5rem; }
    .card {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      padding: 1.5rem;
      overflow-x: auto;
    }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; color: #888; font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.5rem 0.75rem; border-bottom: 2px solid #f1c40f; }
    td { padding: 0.6rem 0.75rem; border-bottom: 1px solid #f0f0f0; color: #333; }
    tr:last-child td { border-bottom: none; }
    .empty { text-align: center; color: #aaa; padding: 2rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Registracijos</h1>
    <p class="count">Iš viso: ${items.length}</p>
    <div class="card">
      ${items.length === 0
        ? '<p class="empty">Kol kas registracijų nėra.</p>'
        : `<table>
        <thead><tr><th>#</th><th>Vardas</th><th>Vaidmuo</th><th>Data</th><th>Hash</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`}
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("lt-LT", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function getHtml() {
  return `<!DOCTYPE html>
<html lang="lt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Geriausio limonado konkursas</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #fef9e7 0%, #eafaf1 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      padding: 2rem 1rem;
    }

    .container {
      max-width: 480px;
      width: 100%;
    }

    .hero {
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .hero svg {
      width: 160px;
      height: 160px;
    }

    h1 {
      text-align: center;
      color: #2c3e50;
      font-size: 1.75rem;
      margin-bottom: 0.75rem;
    }

    .description {
      color: #555;
      line-height: 1.6;
      margin-bottom: 2rem;
      font-size: 1.05rem;
    }

    .description p {
      text-align: center;
      margin-bottom: 0.75rem;
    }

    .steps-title {
      text-align: left !important;
      margin-bottom: 0.25rem !important;
    }

    .steps {
      text-align: left;
      padding-left: 1.25rem;
      margin-bottom: 0.75rem;
    }

    .steps li {
      margin-bottom: 0.3rem;
    }

    .steps .note {
      font-size: 0.9rem;
      color: #888;
    }

    .steps .note a {
      color: #e67e22;
      text-decoration: none;
    }

    .steps .note a:hover {
      text-decoration: underline;
    }

    .prize {
      font-weight: 600;
      color: #2c3e50;
    }

    .team-note {
      font-size: 0.95rem;
      font-style: italic;
      color: #888;
    }

    .card {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      padding: 2rem;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    label {
      display: block;
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 0.5rem;
    }

    input[type="text"] {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 2px solid #e0e0e0;
      border-radius: 10px;
      font-size: 1rem;
      transition: border-color 0.2s;
      outline: none;
    }

    input[type="text"]:focus {
      border-color: #f1c40f;
    }

    .radio-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .radio-option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 0.75rem;
      border: 2px solid #e0e0e0;
      border-radius: 10px;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
    }

    .radio-option:has(input:checked) {
      border-color: #f1c40f;
      background: #fef9e7;
    }

    .radio-option input[type="radio"] {
      accent-color: #f39c12;
      width: 18px;
      height: 18px;
    }

    .radio-option span {
      font-size: 1rem;
      color: #333;
    }

    button {
      width: 100%;
      padding: 0.85rem;
      background: linear-gradient(135deg, #f1c40f, #e67e22);
      color: #fff;
      font-size: 1.1rem;
      font-weight: 700;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }

    .message {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      border-radius: 10px;
      text-align: center;
      font-weight: 500;
      display: none;
    }

    .message.success {
      display: block;
      background: #d5f5e3;
      color: #1e8449;
    }

    .message.error {
      display: block;
      background: #fadbd8;
      color: #c0392b;
    }

    .success-state .card { display: none; }
    .success-state .final-message {
      display: block;
      text-align: center;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      padding: 2.5rem 2rem;
    }

    .final-message {
      display: none;
    }

    .final-message .checkmark {
      font-size: 3rem;
      margin-bottom: 0.75rem;
    }

    .final-message h2 {
      color: #1e8449;
      margin-bottom: 0.5rem;
    }

    .final-message p {
      color: #555;
    }
  </style>
</head>
<body>
  <div class="container" id="app">
    <div class="hero">
      <svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="lemonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#f1c40f"/>
            <stop offset="100%" style="stop-color:#f39c12"/>
          </linearGradient>
          <linearGradient id="glassGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#fffde7"/>
            <stop offset="100%" style="stop-color:#fff176"/>
          </linearGradient>
        </defs>
        <!-- Glass -->
        <path d="M50 55 L45 130 C45 140 55 145 80 145 C105 145 115 140 115 130 L110 55 Z"
              fill="url(#glassGrad)" stroke="#e0e0e0" stroke-width="2"/>
        <!-- Liquid -->
        <path d="M52 75 L47 128 C47 137 57 142 80 142 C103 142 113 137 113 128 L108 75 Z"
              fill="#fff176" opacity="0.7"/>
        <!-- Bubbles -->
        <circle cx="65" cy="110" r="3" fill="#fff" opacity="0.6"/>
        <circle cx="85" cy="100" r="2.5" fill="#fff" opacity="0.5"/>
        <circle cx="75" cy="120" r="2" fill="#fff" opacity="0.4"/>
        <circle cx="95" cy="115" r="3.5" fill="#fff" opacity="0.5"/>
        <!-- Straw -->
        <rect x="90" y="25" width="5" height="100" rx="2" fill="#e74c3c" transform="rotate(10, 92, 75)"/>
        <!-- Lemon slice -->
        <g transform="translate(105, 55) rotate(20)">
          <circle cx="0" cy="0" r="18" fill="url(#lemonGrad)" stroke="#e67e22" stroke-width="1.5"/>
          <circle cx="0" cy="0" r="14" fill="#fef9e7" stroke="#f1c40f" stroke-width="1"/>
          <line x1="0" y1="-12" x2="0" y2="12" stroke="#f1c40f" stroke-width="1"/>
          <line x1="-12" y1="0" x2="12" y2="0" stroke="#f1c40f" stroke-width="1"/>
          <line x1="-8.5" y1="-8.5" x2="8.5" y2="8.5" stroke="#f1c40f" stroke-width="1"/>
          <line x1="8.5" y1="-8.5" x2="-8.5" y2="8.5" stroke="#f1c40f" stroke-width="1"/>
        </g>
        <!-- Leaf -->
        <ellipse cx="42" cy="50" rx="10" ry="5" fill="#27ae60" transform="rotate(-30, 42, 50)"/>
        <!-- Ice cubes -->
        <rect x="58" y="78" width="14" height="12" rx="3" fill="#e8f8f5" opacity="0.7" transform="rotate(-8, 65, 84)"/>
        <rect x="82" y="82" width="12" height="11" rx="3" fill="#e8f8f5" opacity="0.6" transform="rotate(5, 88, 87)"/>
      </svg>
    </div>

    <h1>Geriausio limonado konkursas</h1>
    <div class="description">
      <p>Kviečiame dalyvauti vienoje iš pramogų &mdash; limonado konkurse! Kad sužinoti ar yra susidomėjusių ir atitinkamai planuoti, kviečiame registruotis iš anksto.</p>

      <p class="steps-title"><strong>Konkurso eiga:</strong></p>
      <ol class="steps">
        <li>Registruojatės</li>
        <li>Išsirenkate limonadą, kuris jūsų nuomone vertas nugalėtojo titulo</li>
        <li>Pasiruošiate minutę pristatyti kodėl šitas limonadas geriausias prieš komisiją <span class="note">(formatas nesvarbu, esant specifiniams poreikiams kreipkitės <a href="mailto:tomas@valiunas.dev">tomas@valiunas.dev</a>)</span></li>
        <li>Pristatote ir komisijai duodate paragauti savo limonado</li>
        <li>Komisija ragauja ir vertina limonadą</li>
        <li>Laimite?</li>
      </ol>

      <p class="prize">Nugalėtojas &mdash; tik vienas. Prizas &mdash; dėžė limonado.</p>
      <p class="team-note">Jei registruojatės kaip komanda, įveskite visus komandos narių vardus prie &bdquo;Vardas&ldquo;</p>
    </div>

    <div class="card">
      <form id="regForm" novalidate>
        <div class="form-group">
          <label for="name">Vardas</label>
          <input type="text" id="name" name="name" placeholder="Įveskite savo vardą" required autocomplete="given-name">
        </div>

        <div class="form-group">
          <label>Vaidmuo</label>
          <div class="radio-group">
            <label class="radio-option">
              <input type="radio" name="role" value="participant">
              <span>Dalyvis</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="role" value="judge">
              <span>Teisėjas</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="role" value="any" checked>
              <span>Nesvarbu</span>
            </label>
          </div>
        </div>

        <button type="submit" id="submitBtn">Registruotis</button>
        <div class="message" id="message"></div>
      </form>
    </div>

    <div class="final-message">
      <div class="checkmark">&#10004;&#65039;</div>
      <h2>Registracija sėkminga!</h2>
      <p>Ačiū, kad užsiregistravote. Iki pasimatymo konkurse!</p>
    </div>
  </div>

  <script>
    const form = document.getElementById("regForm");
    const msg = document.getElementById("message");
    const btn = document.getElementById("submitBtn");

    function getFingerprint() {
      let fp = localStorage.getItem("lemonade_fp");
      if (!fp) {
        fp = crypto.randomUUID();
        localStorage.setItem("lemonade_fp", fp);
      }
      return fp;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      msg.className = "message";
      msg.style.display = "none";

      const name = document.getElementById("name").value.trim();
      const role = form.role.value;
      const fingerprint = getFingerprint();

      if (!name) {
        showMsg("Prašome įvesti vardą.", true);
        return;
      }

      btn.disabled = true;
      btn.textContent = "Registruojama...";

      try {
        const res = await fetch(window.location.href, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, role, fingerprint }),
        });

        const data = await res.json();

        if (data.success) {
          document.getElementById("app").classList.add("success-state");
        } else {
          showMsg(data.error || "Įvyko klaida.", true);
        }
      } catch {
        showMsg("Nepavyko prisijungti. Bandykite dar kartą.", true);
      } finally {
        btn.disabled = false;
        btn.textContent = "Registruotis";
      }
    });

    function showMsg(text, isError) {
      msg.textContent = text;
      msg.className = "message " + (isError ? "error" : "success");
    }
  </script>
</body>
</html>`;
}
