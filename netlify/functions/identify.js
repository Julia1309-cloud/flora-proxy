const https = require("https");

exports.handler = async function (event) {
  // CORS – erlaubt Anfragen von überall (auch GitHub Pages)
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  }

  try {
    // Body ist base64-kodiertes Bild von der App
    const { image } = JSON.parse(event.body);
    if (!image) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Kein Bild" }) };
    }

    // Base64 → Buffer
    const imgBuffer = Buffer.from(image, "base64");

    // Multipart-Body für Pl@ntNet manuell bauen
    const boundary = "----FlораBoundary" + Date.now();
    const CRLF = "\r\n";

    // Pflanzenteil (Blatt ist am zuverlässigsten)
    const organ = "auto"; // auto = Pl@ntNet erkennt selbst

    let bodyParts = "";
    bodyParts += `--${boundary}${CRLF}`;
    bodyParts += `Content-Disposition: form-data; name="organs"${CRLF}${CRLF}`;
    bodyParts += `${organ}${CRLF}`;

    const beforeImage = Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="images"; filename="plant.jpg"${CRLF}` +
      `Content-Type: image/jpeg${CRLF}${CRLF}`
    );
    const afterImage = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
    const textPart = Buffer.from(bodyParts);

    const bodyBuffer = Buffer.concat([textPart, beforeImage, imgBuffer, afterImage]);

    // Pl@ntNet API aufrufen
    const API_KEY = "2b10C4NysEFOH2SvuMTOyrWZHe";
    const options = {
      hostname: "my-api.plantnet.org",
      path: `/v2/identify/all?api-key=${API_KEY}&lang=de&include-related-images=false`,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": bodyBuffer.length,
      },
    };

    const result = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      });
      req.on("error", reject);
      req.write(bodyBuffer);
      req.end();
    });

    if (result.status !== 200) {
      return {
        statusCode: result.status,
        headers,
        body: JSON.stringify({ error: "Pl@ntNet Fehler", detail: result.body }),
      };
    }

    const plantData = JSON.parse(result.body);
    const best = plantData.results?.[0];

    if (!best) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ found: false }),
      };
    }

    const score = Math.round(best.score * 100);
    const species = best.species;
    const germanName =
      species.commonNames?.find((n) => /[äöüÄÖÜß]/.test(n)) ||
      species.commonNames?.[0] ||
      species.scientificNameWithoutAuthor;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        found: true,
        name: germanName,
        latin: species.scientificNameWithoutAuthor,
        family: species.family?.scientificNameWithoutAuthor || "",
        score: score,
        type: "plant",
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
