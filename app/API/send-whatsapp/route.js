export async function POST(req) {
  const token = process.env.WHATSAPP_TOKEN;
  const url = "https://graph.facebook.com/v22.0/786386161226350/messages";

  try {
    const body = await req.json();
    const phones = Array.isArray(body?.phones) ? body.phones : [];

    if (!phones.length) {
      return Response.json(
        { error: "No se recibieron teléfonos para enviar." },
        { status: 400 }
      );
    }

    const results = [];

    for (const rawPhone of phones) {
      const phone = String(rawPhone).trim();
      if (!phone) continue;

      const payload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: "hello_world",
          language: {
            code: "en_US",
          },
        },
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);
      results.push({
        to: phone,
        status: response.status,
        ok: response.ok,
        response: data,
      });
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

