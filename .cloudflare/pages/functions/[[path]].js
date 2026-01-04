function isMissing(obj) {
  return !obj || !obj.body || !obj.size;
}

export const onRequest = async (context) => {
  const url = new URL(context.request.url);
  const origPath = url.pathname;
  let pathname = origPath;

  // Try direct file
  let key = pathname.slice(1);
  let obj = await context.env.NIGHTLY_BUILDS.get(key);

  const looksLikeDir = !origPath.includes(".");

  if (isMissing(obj) && looksLikeDir) {

    // If no slash → redirect
    if (!origPath.endsWith("/")) {
      const redirectUrl = new URL(context.request.url);
      redirectUrl.pathname = origPath + "/";
      return Response.redirect(redirectUrl.toString(), 302);
    }

    // Try directory index
    key = (origPath + "index.html").slice(1);
    obj = await context.env.NIGHTLY_BUILDS.get(key);
  }

  if (isMissing(obj)) {
    return new Response("Not found", { status: 404 });
  }

  // Preserve original content-type for use after negotiating compression
  const originalContentType = obj.httpMetadata?.contentType || "application/octet-stream";

  // Negotiate pre-compressed variants: Brotli preferred, then gzip
  const acceptEncoding = context.request.headers.get("Accept-Encoding") || "";
  let encoding;

  if (acceptEncoding.includes("br")) {
    const brKey = key + ".br";
    const brObj = await context.env.NIGHTLY_BUILDS.get(brKey);
    if (!isMissing(brObj)) {
      obj = brObj;
      encoding = "br";
    }
  }

  // Fallback to gzip if supported
  if (!encoding && acceptEncoding.includes("gzip")) {
    const gzKey = key + ".gz";
    const gzObj = await context.env.NIGHTLY_BUILDS.get(gzKey);
    if (!isMissing(gzObj)) {
      obj = gzObj;
      encoding = "gzip";
    }
  }

  const headers = {
    "Content-Type": originalContentType,
    "Access-Control-Allow-Origin": "*",
  };
  if (encoding) {
    headers["Content-Encoding"] = encoding;
    headers["Vary"] = "Accept-Encoding";
  }

  return new Response(obj.body, { headers });
};
