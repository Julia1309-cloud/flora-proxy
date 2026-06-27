const https = require("https");

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body);
    const image = body.image;

    if (!image) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Kein Bild" }) };
    }

    const imgBuffer = Buffer.from(image, "base64");
    const boundary = "FloraBoundary" + Date.now();
    const CRLF = "\r\n";

    const part1 = Buffer.from(
      "--" + boundary + CRLF +
      "Content-Disposition: form-data; name=\"organs\"" + CRLF + CRLF +
      "auto" + CRLF +
      "--" + boundary + CRLF +
      "Content-Disposition: form-data; name=\"images\"; filename=\"plant.jpg\"" + CRLF +
      "Content-Type: image/jpeg" + CRLF + CRLF
    );

    const part2 = Buffer.from(CRLF + "--" + boundary + "--" + CRLF);
    const bodyBuffer = Buffer.concat([part1, imgBuffer, part2]);

    const API_KEY = "2b10C4NysEFOH2SvuMTOyrWZHe";

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: "my-api.plantnet.org",
        path: "/v2/identify/all?api-key=" + API_KEY + "&lang=de&include-related-images=false",
        method: "POST",
        headers: {
          "Content-Type": "multipart/form-data; boundary=" + boundary,
          "Content-Length": bodyBuffer.length,
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      });
      req.on("error", (e) => reject(e));
      req.write(bodyBuffer);
      req.end();
    });

    console.log("PlantNet status:", result.status);
    console.log("PlantNet body:", result.body.substring(0, 500));

    if (result.status === 404) {
      return { statusCode: 200, headers, body: JSON.stringify({ found: false, debug: "Keine Pflanze erkannt" }) };
    }

    if (result.status !== 200) {
      return { statusCode: 200, headers, body: JSON.stringify({ found: false, debug: "PlantNet " + result.status + ": " + result.body }) };
    }

    const plantData = JSON.parse(result.body);
    const best = plantData.results && plantData.results[0];

    if (!best) {
      return { statusCode: 200, headers, body: JSON.stringify({ found: false, debug: "Keine Ergebnisse" }) };
    }

    const score = Math.round(best.score * 100);
    const species = best.species;
    const commonNames = species.commonNames || [];
    const germanName = commonNames.find(function(n) { return /[äöüÄÖÜß]/.test(n); }) || commonNames[0] || species.scientificNameWithoutAuthor;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        found: true,
        name: germanName,
        latin: species.scientificNameWithoutAuthor,
        family: (species.family && species.family.scientificNameWithoutAuthor) || "",
        score: score,
        type: "plant",
      }),
    };

  } catch (err) {
    console.log("Error:", err.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ found: false, debug: "Fehler: " + err.message }),
    };
  }
};
